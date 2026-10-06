create table public.event_quote_plans (
 quote_id uuid primary key references public.documents(id) on delete cascade,
 billing_model text not null default 'undecided' check(billing_model in ('undecided','global','direct','mixed')),
 client_budget_ttc numeric(12,2) check(client_budget_ttc>=0), external_client_ttc numeric(12,2) not null default 0 check(external_client_ttc>=0),
 costs jsonb not null default '[]'::jsonb check(jsonb_typeof(costs)='array'),
 preparation_hours numeric(8,2) not null default 0 check(preparation_hours>=0), setup_hours numeric(8,2) not null default 0 check(setup_hours>=0),
 operation_hours numeric(8,2) not null default 0 check(operation_hours>=0), teardown_hours numeric(8,2) not null default 0 check(teardown_hours>=0),
 hourly_value numeric(10,2) not null default 0 check(hourly_value>=0), costs_checked boolean not null default false,
 updated_at timestamptz not null default now()
);
create table public.event_team_members (
 id uuid primary key default gen_random_uuid(), name text not null check(length(trim(name)) between 1 and 120), active boolean not null default true
);
create unique index event_team_member_name on public.event_team_members(lower(trim(name)));
insert into public.event_team_members(name) values('Maxime'),('Paul');
create table public.event_resource_bookings (
 id uuid primary key default gen_random_uuid(), event_id uuid not null references public.event_sheets(id) on delete restrict,
 kind text not null check(kind in ('material','team','supplier')),
 material_id uuid references public.materiel(id) on delete restrict, member_id uuid references public.event_team_members(id) on delete restrict, contact_id uuid references public.contacts(id) on delete restrict,
 quantity integer not null default 1 check(quantity>0), starts_at timestamptz not null, ends_at timestamptz not null check(ends_at>starts_at),
 label text not null check(length(trim(label))>0), status text not null default 'tentative' check(status in ('tentative','confirmed','cancelled')),
 paid_by text not null default 'faste' check(paid_by in ('faste','client')), notes text, created_at timestamptz not null default now(),
 check((kind='material' and material_id is not null and member_id is null and contact_id is null) or
       (kind='team' and material_id is null and member_id is not null and contact_id is null and quantity=1) or
       (kind='supplier' and material_id is null and member_id is null and contact_id is not null and quantity=1))
);
create index event_resource_event_idx on public.event_resource_bookings(event_id);
create index event_resource_material_idx on public.event_resource_bookings(material_id,starts_at,ends_at) where status<>'cancelled';
create index event_resource_member_idx on public.event_resource_bookings(member_id,starts_at,ends_at) where status<>'cancelled';
create index event_resource_contact_idx on public.event_resource_bookings(contact_id,starts_at,ends_at) where status<>'cancelled';
do $$ declare t text; begin
 foreach t in array array['event_quote_plans','event_team_members','event_resource_bookings'] loop
 execute format('alter table public.%I enable row level security',t);
 execute format('revoke all on public.%I from anon',t);
 execute format('grant select,insert,update on public.%I to authenticated',t);
 execute format('create policy faste_planning_access on public.%I for all to authenticated using ((select auth.uid())=any(array[%L::uuid,%L::uuid])) with check ((select auth.uid())=any(array[%L::uuid,%L::uuid]))',t,'108241bf-f493-46fd-b09d-eee3de67e08a','4de67d73-40b2-43e9-8063-76899188ba18','108241bf-f493-46fd-b09d-eee3de67e08a','4de67d73-40b2-43e9-8063-76899188ba18');
 end loop;
end $$;
create function private.event_quote_plan_guard() returns trigger language plpgsql security invoker set search_path=pg_catalog,public as $$
declare c jsonb; begin
 if not exists(select 1 from public.documents where id=new.quote_id and type='devis') then raise exception 'Le budget interne doit être lié à un devis'; end if;
 if jsonb_array_length(new.costs)>100 then raise exception '100 lignes de coûts maximum'; end if;
 for c in select value from jsonb_array_elements(new.costs) loop
  if jsonb_typeof(c)<>'object' or length(trim(coalesce(c->>'label','')))=0 or coalesce(c->>'category','') not in ('supplier','rental','transport','logistics','staff','other') or jsonb_typeof(c->'amount') is distinct from 'number' or (c->>'amount')::numeric<0 or (c->>'amount')::numeric>9999999999 then raise exception 'Ligne de coût prévue invalide'; end if;
 end loop;
 new.updated_at=now();return new;
end $$;
create trigger event_quote_plan_guard before insert or update on public.event_quote_plans for each row execute function private.event_quote_plan_guard();
revoke all on function private.event_quote_plan_guard() from public,anon; grant execute on function private.event_quote_plan_guard() to authenticated;
create function public.save_faste_document_with_plan(p_document jsonb,p_lines jsonb,p_plan jsonb) returns jsonb language plpgsql security invoker set search_path=pg_catalog,public as $$
declare d jsonb; begin
 if (select auth.uid()) is null or not ((select auth.uid())=any(array['108241bf-f493-46fd-b09d-eee3de67e08a'::uuid,'4de67d73-40b2-43e9-8063-76899188ba18'::uuid])) then raise exception 'Accès FASTE non autorisé'; end if;
 if coalesce(p_document->>'type','devis')<>'devis' then raise exception 'Le budget interne concerne uniquement les devis'; end if;
 d=public.save_faste_document(p_document,p_lines);
 insert into public.event_quote_plans(quote_id,billing_model,client_budget_ttc,external_client_ttc,costs,preparation_hours,setup_hours,operation_hours,teardown_hours,hourly_value,costs_checked)
 values((d->>'id')::uuid,coalesce(p_plan->>'billing_model','undecided'),nullif(p_plan->>'client_budget_ttc','')::numeric,coalesce((p_plan->>'external_client_ttc')::numeric,0),coalesce(p_plan->'costs','[]'::jsonb),coalesce((p_plan->>'preparation_hours')::numeric,0),coalesce((p_plan->>'setup_hours')::numeric,0),coalesce((p_plan->>'operation_hours')::numeric,0),coalesce((p_plan->>'teardown_hours')::numeric,0),coalesce((p_plan->>'hourly_value')::numeric,0),coalesce((p_plan->>'costs_checked')::boolean,false))
 on conflict(quote_id) do update set billing_model=excluded.billing_model,client_budget_ttc=excluded.client_budget_ttc,external_client_ttc=excluded.external_client_ttc,costs=excluded.costs,preparation_hours=excluded.preparation_hours,setup_hours=excluded.setup_hours,operation_hours=excluded.operation_hours,teardown_hours=excluded.teardown_hours,hourly_value=excluded.hourly_value,costs_checked=excluded.costs_checked;
 return d;
end $$;
revoke all on function public.save_faste_document_with_plan(jsonb,jsonb,jsonb) from public,anon; grant execute on function public.save_faste_document_with_plan(jsonb,jsonb,jsonb) to authenticated;
create function private.event_resource_guard() returns trigger language plpgsql security invoker set search_path=pg_catalog,public as $$
declare capacity integer; used integer; point timestamptz; begin
 if tg_op='UPDATE' and old.status='cancelled' then raise exception 'Réservation annulée : créez une nouvelle ligne'; end if;
 if new.status='cancelled' then return new; end if;
 -- Lock all booking writes against each other, including changes of resource, to avoid confirmation races.
 perform pg_advisory_xact_lock(7826147);
 if new.kind='material' then
  select quantite into capacity from public.materiel where id=new.material_id;
  if capacity is null then raise exception 'Quantité du matériel à renseigner'; end if;
 elsif new.kind='team' then
  if not exists(select 1 from public.event_team_members where id=new.member_id and active) then raise exception 'Équipier inactif ou introuvable'; end if;
  capacity=1;
 elsif new.kind='supplier' then
  if not exists(select 1 from public.contacts where id=new.contact_id and type='prestataire') then raise exception 'Choisissez un contact de type Prestataire'; end if;
  return new; -- A supplier company may provide several teams; overlaps are shown as checks in the UI.
 end if;
 if new.status='confirmed' then
  for point in select new.starts_at union select b.starts_at from public.event_resource_bookings b where b.id<>new.id and b.status='confirmed' and b.kind=new.kind and ((new.kind='material' and b.material_id=new.material_id) or (new.kind='team' and b.member_id=new.member_id)) and b.starts_at>=new.starts_at and b.starts_at<new.ends_at loop
   select coalesce(sum(b.quantity),0) into used from public.event_resource_bookings b where b.id<>new.id and b.status='confirmed' and b.kind=new.kind and ((new.kind='material' and b.material_id=new.material_id) or (new.kind='team' and b.member_id=new.member_id)) and b.starts_at<=point and b.ends_at>point;
   if used+new.quantity>capacity then raise exception 'Conflit : ressource déjà confirmée ou quantité insuffisante. Gardez À confirmer et ajustez le planning.'; end if;
  end loop;
 end if;
 return new;
end $$;
create trigger event_resource_guard before insert or update on public.event_resource_bookings for each row execute function private.event_resource_guard();
revoke all on function private.event_resource_guard() from public,anon; grant execute on function private.event_resource_guard() to authenticated;
