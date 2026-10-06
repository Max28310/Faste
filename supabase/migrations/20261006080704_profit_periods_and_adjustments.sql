alter table public.finance_settings add column fiscal_start_month smallint not null default 1 check(fiscal_start_month between 1 and 12);
alter table public.finance_settings add column reduced_is_confirmed boolean not null default false;
create table public.finance_adjustments (
 id uuid primary key default gen_random_uuid(), document_date date not null, label text not null check(length(trim(label))>0),
 reference text not null check(length(trim(reference))>0),
 category text not null check(category in ('depreciation','provision','other_expense','other_income','tax_addback','tax_deduction')),
 amount numeric(12,2) not null check(amount<>0), notes text, cancelled boolean not null default false,
 created_at timestamptz not null default now(),
 check((category in ('depreciation','provision','other_expense','tax_deduction') and amount<0) or (category in ('other_income','tax_addback') and amount>0))
);
alter table public.finance_adjustments enable row level security;
revoke all on public.finance_adjustments from anon;
grant select,insert,update on public.finance_adjustments to authenticated;
create policy faste_adjustments_access on public.finance_adjustments for all to authenticated
 using ((select auth.uid())=any(array['108241bf-f493-46fd-b09d-eee3de67e08a'::uuid,'4de67d73-40b2-43e9-8063-76899188ba18'::uuid]))
 with check ((select auth.uid())=any(array['108241bf-f493-46fd-b09d-eee3de67e08a'::uuid,'4de67d73-40b2-43e9-8063-76899188ba18'::uuid]));
create function private.finance_adjustment_guard() returns trigger language plpgsql security invoker set search_path=pg_catalog,public as $body$
begin
 if (to_jsonb(new)-'cancelled')<>(to_jsonb(old)-'cancelled') or old.cancelled then raise exception 'Ajustement conservé : annulez-le puis saisissez la correction'; end if;
 return new;
end $body$;
create trigger finance_adjustment_guard before update on public.finance_adjustments for each row execute function private.finance_adjustment_guard();
revoke all on function private.finance_adjustment_guard() from public,anon;
grant execute on function private.finance_adjustment_guard() to authenticated;
alter table public.finance_attachments add column adjustment_id uuid references public.finance_adjustments(id) on delete restrict;
do $$ declare c record; begin
 for c in select conname from pg_constraint where conrelid='public.finance_attachments'::regclass and contype='c' and pg_get_constraintdef(oid) like '%num_nonnulls%' loop
 execute format('alter table public.finance_attachments drop constraint %I',c.conname);
 end loop;
end $$;
alter table public.finance_attachments add constraint finance_attachments_one_target check(num_nonnulls(expense_id,document_id,payment_id,flow_id,adjustment_id)=1);
create index finance_attachments_adjustment_idx on public.finance_attachments(adjustment_id);
