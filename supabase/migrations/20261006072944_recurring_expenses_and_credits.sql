-- Récurrences mensuelles : les montants générés restent à vérifier, jamais payés automatiquement.
create table public.finance_recurring (
 id uuid primary key default gen_random_uuid(), supplier text not null check(length(trim(supplier))>0),
 label text not null check(length(trim(label))>0), category text not null default 'Autre',
 amount_ht numeric(12,2) not null check(amount_ht>=0), amount_vat numeric(12,2) not null check(amount_vat>=0),
 start_date date not null, end_date date, day_of_month integer not null check(day_of_month between 1 and 31),
 active boolean not null default true, notes text, created_at timestamptz not null default now(),
 check(end_date is null or end_date>=start_date)
);
alter table public.finance_expenses add column recurring_id uuid references public.finance_recurring(id) on delete restrict;
alter table public.finance_expenses add column recurring_month date;
alter table public.finance_expenses add column provisional boolean not null default false;
create unique index finance_recurring_month_unique on public.finance_expenses(recurring_id,recurring_month);
create sequence public.finance_credit_number;
create table public.finance_credits (
 id uuid primary key default gen_random_uuid(), document_id uuid not null references public.documents(id) on delete restrict,
 number text not null unique default ('AV-'||extract(year from current_date)::text||'-'||lpad(nextval('public.finance_credit_number')::text,6,'0')),
 document_date date not null default current_date, reason text not null check(length(trim(reason))>0),
 amount_ht numeric(12,2) not null check(amount_ht>0), amount_vat numeric(12,2) not null check(amount_vat>=0),
 cancelled boolean not null default false, created_at timestamptz not null default now()
);
create index finance_credits_document_idx on public.finance_credits(document_id);
do $block$ declare t text; begin
 foreach t in array array['finance_recurring','finance_credits'] loop
 execute format('alter table public.%I enable row level security',t);
 execute format('revoke all on public.%I from anon',t);
 execute format('grant select,insert,update on public.%I to authenticated',t);
 execute format('create policy finance_access on public.%I for all to authenticated using ((select auth.uid())=any(array[''108241bf-f493-46fd-b09d-eee3de67e08a''::uuid,''4de67d73-40b2-43e9-8063-76899188ba18''::uuid])) with check ((select auth.uid())=any(array[''108241bf-f493-46fd-b09d-eee3de67e08a''::uuid,''4de67d73-40b2-43e9-8063-76899188ba18''::uuid]))',t);
 end loop;
end $block$;
grant usage on sequence public.finance_credit_number to authenticated;
create function private.finance_generate_recurring() returns integer language plpgsql security invoker set search_path=pg_catalog,public as $body$
declare r public.finance_recurring; m date; d date; today date := (now() at time zone 'Europe/Paris')::date; n integer:=0; added integer;
begin
 if current_user<>'postgres' and not coalesce((select auth.uid())=any(array['108241bf-f493-46fd-b09d-eee3de67e08a'::uuid,'4de67d73-40b2-43e9-8063-76899188ba18'::uuid]),false) then raise exception 'Accès non autorisé'; end if;
 for r in select * from public.finance_recurring where active for update loop
  m:=date_trunc('month',r.start_date)::date;
  while m<=today loop
   d:=m+least(r.day_of_month,extract(day from (m+interval '1 month - 1 day'))::integer)-1;
   if d>=r.start_date and d<=today and (r.end_date is null or d<=r.end_date) then
    insert into public.finance_expenses(supplier,reference,document_date,due_date,category,kind,amount_ht,amount_vat,notes,recurring_id,recurring_month,provisional)
    values(r.supplier,'REC-'||r.id::text||'-'||to_char(m,'YYYY-MM'),d,d,r.category,'charge',r.amount_ht,r.amount_vat,r.label||' — Montant à vérifier avec le justificatif du mois.',r.id,m,true)
    on conflict(recurring_id,recurring_month) do nothing;
    get diagnostics added=row_count; n:=n+added;
   end if;
   m:=(m+interval '1 month')::date;
  end loop;
 end loop;
 return n;
end $body$;
create function public.finance_generate_recurring() returns integer language sql security invoker set search_path=pg_catalog,public as $body$ select private.finance_generate_recurring(); $body$;
revoke all on function private.finance_generate_recurring(), public.finance_generate_recurring() from public,anon;
grant execute on function private.finance_generate_recurring(), public.finance_generate_recurring() to authenticated;
create extension if not exists pg_cron;
select cron.schedule('faste-recurring-expenses','15 * * * *','select private.finance_generate_recurring();');

-- Avoirs imputés à une facture non soldée. Les remboursements bancaires ne sont pas inventés.
create function private.finance_credit_guard() returns trigger language plpgsql security invoker set search_path=pg_catalog,public as $body$
declare d public.documents; ht numeric; vat numeric;
begin
 if tg_op='UPDATE' and ((to_jsonb(new)-'cancelled')<>(to_jsonb(old)-'cancelled') or old.cancelled) then raise exception 'Avoir conservé : annulez-le puis créez une correction'; end if;
 select * into d from public.documents where id=new.document_id for update;
 if d.type<>'facture' or new.document_date<d.document_date then raise exception 'Sélectionnez une facture antérieure à l’avoir'; end if;
 select coalesce(sum(amount_ht),0),coalesce(sum(amount_vat),0) into ht,vat from public.finance_credits where document_id=d.id and not cancelled and id<>new.id;
 if not new.cancelled then ht:=ht+new.amount_ht; vat:=vat+new.amount_vat; end if;
 if ht>d.total_ht or vat>d.total_vat or ht+vat+d.paid_amount>d.total_ttc then raise exception 'Cet avoir dépasse la partie non encaissée. Le remboursement d’une facture payée nécessite un traitement distinct.'; end if;
 return new;
end $body$;
create trigger finance_credit_guard before insert or update on public.finance_credits for each row execute function private.finance_credit_guard();
create function private.finance_credit_sync() returns trigger language plpgsql security invoker set search_path=pg_catalog,public as $body$ begin update public.documents set paid_amount=paid_amount where id=new.document_id; return new; end $body$;
create trigger finance_credit_sync after insert or update on public.finance_credits for each row execute function private.finance_credit_sync();
create function private.finance_credit_payment_guard() returns trigger language plpgsql security invoker set search_path=pg_catalog,public as $body$
declare t numeric; p numeric; c numeric;
begin
 if new.document_id is not null and not new.cancelled then
  select total_ttc,finance_initial_paid into t,p from public.documents where id=new.document_id for update;
  select p+coalesce(sum(amount),0) into p from public.finance_payments where document_id=new.document_id and not cancelled and id<>new.id;
  select coalesce(sum(amount_ht+amount_vat),0) into c from public.finance_credits where document_id=new.document_id and not cancelled;
  if p+new.amount+c>t then raise exception 'Paiement supérieur au restant après avoir'; end if;
 end if;
 return new;
end $body$;
create trigger finance_credit_payment_guard before insert or update on public.finance_payments for each row execute function private.finance_credit_payment_guard();
create or replace function private.finance_document_totals() returns trigger language plpgsql security invoker set search_path=pg_catalog,public as $body$
declare ledger numeric; has_ledger boolean; credit_ht numeric:=0; credit_vat numeric:=0;
begin
 if tg_op='INSERT' then new.finance_initial_paid:=new.paid_amount;
 else
  select exists(select 1 from public.finance_payments where document_id=new.id),coalesce(sum(amount) filter(where not cancelled),0) into has_ledger,ledger from public.finance_payments where document_id=new.id;
  if has_ledger then new.finance_initial_paid:=old.finance_initial_paid; new.paid_amount:=old.finance_initial_paid+ledger; else new.finance_initial_paid:=new.paid_amount; end if;
  select coalesce(sum(amount_ht),0),coalesce(sum(amount_vat),0) into credit_ht,credit_vat from public.finance_credits where document_id=new.id and not cancelled;
 end if;
 if new.paid_amount+credit_ht+credit_vat>new.total_ttc or credit_ht>new.total_ht or credit_vat>new.total_vat then raise exception 'Total inférieur aux paiements et avoirs enregistrés'; end if;
 new.remaining_amount:=new.total_ttc-new.paid_amount-credit_ht-credit_vat;
 if new.type='facture' then new.status:=case when new.total_ttc>0 and new.remaining_amount=0 then 'paid' when new.paid_amount>0 then 'partial' when new.due_date<current_date then 'late' else 'unpaid' end; end if;
 return new;
end $body$;
revoke all on function private.finance_credit_guard(),private.finance_credit_sync(),private.finance_credit_payment_guard() from public,anon;
grant execute on function private.finance_credit_guard(),private.finance_credit_sync(),private.finance_credit_payment_guard() to authenticated;
