create unique index finance_expense_duplicate_guard on public.finance_expenses(lower(trim(supplier)),lower(trim(reference)),document_date) where not archived;
create or replace function private.finance_flow_guard() returns trigger language plpgsql security invoker set search_path=pg_catalog,public as $body$
begin
 if tg_op='UPDATE' then
   if old.cancelled then raise exception 'Ce mouvement est déjà annulé'; end if;
   if (to_jsonb(new)-'cancelled'-'realized')<>(to_jsonb(old)-'cancelled'-'realized') then raise exception 'Annulez le mouvement puis ajoutez une correction pour conserver son historique'; end if;
   if old.realized and not new.realized then raise exception 'Annulez le mouvement réalisé puis ajoutez une correction'; end if;
 end if;
 return new;
end $body$;
create trigger finance_flow_guard before update on public.finance_flows for each row execute function private.finance_flow_guard();
revoke all on function private.finance_flow_guard() from public;
grant execute on function private.finance_flow_guard() to authenticated;
