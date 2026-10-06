create or replace function public.finance_generate_recurring() returns integer language plpgsql security invoker set search_path=pg_catalog,public as $body$
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

create or replace function private.finance_generate_recurring() returns integer language sql security invoker set search_path=pg_catalog,public as $body$ select public.finance_generate_recurring(); $body$;
revoke all on function private.finance_generate_recurring() from public,anon,authenticated;
revoke all on function public.finance_generate_recurring() from public,anon;
grant execute on function public.finance_generate_recurring() to authenticated;
