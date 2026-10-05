-- Extension additive. Aucune facture, aucun paiement historique ni compte existant supprimé.
alter table public.documents add column if not exists finance_initial_paid numeric(12,2);
update public.documents set finance_initial_paid=paid_amount where finance_initial_paid is null;
alter table public.documents alter column finance_initial_paid set default 0;
alter table public.documents alter column finance_initial_paid set not null;

create table public.finance_expenses (
 id uuid primary key default gen_random_uuid(), event_id uuid references public.event_sheets(id) on delete restrict,
 document_id uuid references public.documents(id) on delete restrict,
 supplier text not null check(length(trim(supplier))>0), reference text not null check(length(trim(reference))>0),
 document_date date not null, due_date date not null,
 category text not null default 'Autre', kind text not null default 'charge' check(kind in ('charge','investment','advance')),
 amount_ht numeric(12,2) not null check(amount_ht>=0), amount_vat numeric(12,2) not null check(amount_vat>=0),
 deduction_status text not null default 'unknown' check(deduction_status in ('unknown','yes','no')),
 deductible_vat numeric(12,2) not null default 0 check(deductible_vat>=0 and deductible_vat<=amount_vat),
 notes text, archived boolean not null default false,
 created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
 check(not (event_id is not null and document_id is not null)),
 check(deduction_status='yes' or deductible_vat=0)
);
create table public.finance_payments (
 id uuid primary key default gen_random_uuid(), document_id uuid references public.documents(id) on delete restrict,
 expense_id uuid references public.finance_expenses(id) on delete restrict,
 amount numeric(12,2) not null check(amount>0), payment_date date not null check(payment_date<=current_date),
 payer text not null default 'bank' check(payer in ('bank','Paul','Maxime')),
 reference text not null check(length(trim(reference))>0), cancelled boolean not null default false,
 created_at timestamptz not null default now(), check(num_nonnulls(document_id,expense_id)=1),
 check(document_id is null or payer='bank')
);
create table public.finance_flows (
 id uuid primary key default gen_random_uuid(), label text not null check(length(trim(label))>0), flow_date date not null,
 amount numeric(12,2) not null check(amount<>0), category text not null default 'other',
 beneficiary text check(beneficiary in ('Paul','Maxime')),
 realized boolean not null default false, cancelled boolean not null default false,
 created_at timestamptz not null default now(),
 check(category<>'reimbursement' or (amount<0 and beneficiary is not null)),
 check(not realized or flow_date<=current_date)
);
create table public.finance_settings (
 id smallint primary key default 1 check(id=1), balance_date date, balance_amount numeric(12,2),
 updated_at timestamptz not null default now(), check((balance_date is null)=(balance_amount is null)),
 check(balance_date is null or balance_date<=current_date)
);
create table public.finance_attachments (
 id uuid primary key default gen_random_uuid(), expense_id uuid references public.finance_expenses(id) on delete restrict,
 document_id uuid references public.documents(id) on delete restrict,
 payment_id uuid references public.finance_payments(id) on delete restrict,
 flow_id uuid references public.finance_flows(id) on delete restrict,
 path text not null unique, filename text not null, mime_type text not null, size integer not null check(size>0 and size<=10485760),
 created_at timestamptz not null default now(), check(num_nonnulls(expense_id,document_id,payment_id,flow_id)=1)
);
create index finance_expenses_event_idx on public.finance_expenses(event_id);
create index finance_expenses_document_idx on public.finance_expenses(document_id);
create index finance_payments_document_idx on public.finance_payments(document_id);
create index finance_payments_expense_idx on public.finance_payments(expense_id);
create index finance_attachments_expense_idx on public.finance_attachments(expense_id);
create index finance_attachments_document_idx on public.finance_attachments(document_id);
create index finance_attachments_payment_idx on public.finance_attachments(payment_id);
create index finance_attachments_flow_idx on public.finance_attachments(flow_id);

-- Même périmètre d'accès que l'application FASTE existante : ses deux associés.
do $block$
declare t text;
begin
 foreach t in array array['finance_expenses','finance_payments','finance_flows','finance_settings','finance_attachments'] loop
 execute format('alter table public.%I enable row level security',t);
 execute format('revoke all on public.%I from anon',t);
 execute format('grant select,insert,update on public.%I to authenticated',t);
 execute format('create policy finance_select on public.%I for select to authenticated using ((select auth.uid()) = any(array[''108241bf-f493-46fd-b09d-eee3de67e08a''::uuid,''4de67d73-40b2-43e9-8063-76899188ba18''::uuid]))',t);
 execute format('create policy finance_insert on public.%I for insert to authenticated with check ((select auth.uid()) = any(array[''108241bf-f493-46fd-b09d-eee3de67e08a''::uuid,''4de67d73-40b2-43e9-8063-76899188ba18''::uuid]))',t);
 execute format('create policy finance_update on public.%I for update to authenticated using ((select auth.uid()) = any(array[''108241bf-f493-46fd-b09d-eee3de67e08a''::uuid,''4de67d73-40b2-43e9-8063-76899188ba18''::uuid])) with check ((select auth.uid()) = any(array[''108241bf-f493-46fd-b09d-eee3de67e08a''::uuid,''4de67d73-40b2-43e9-8063-76899188ba18''::uuid]))',t);
 end loop;
end $block$;

create or replace function private.finance_document_totals() returns trigger language plpgsql security invoker set search_path=pg_catalog,public as $body$
declare ledger numeric; has_ledger boolean;
begin
 if tg_op='INSERT' then new.finance_initial_paid:=new.paid_amount;
 else
   select exists(select 1 from public.finance_payments where document_id=new.id),coalesce(sum(amount) filter(where not cancelled),0) into has_ledger,ledger from public.finance_payments where document_id=new.id;
   if has_ledger then new.finance_initial_paid:=old.finance_initial_paid; new.paid_amount:=old.finance_initial_paid+ledger;
   else new.finance_initial_paid:=new.paid_amount; end if;
 end if;
 if new.paid_amount>new.total_ttc then raise exception 'Le total de facture ne peut pas être inférieur aux paiements enregistrés'; end if;
 new.remaining_amount:=new.total_ttc-new.paid_amount;
 if new.type='facture' then new.status:=case when new.total_ttc>0 and new.remaining_amount=0 then 'paid' when new.paid_amount>0 then 'partial' when new.due_date<current_date then 'late' else 'unpaid' end; end if;
 return new;
end $body$;
create trigger finance_document_totals before insert or update on public.documents for each row execute function private.finance_document_totals();

create or replace function private.finance_payment_guard() returns trigger language plpgsql security invoker set search_path=pg_catalog,public as $body$
declare target public.documents; expense public.finance_expenses; total_paid numeric;
begin
 if tg_op='UPDATE' and (to_jsonb(new)-'cancelled')<>(to_jsonb(old)-'cancelled') then raise exception 'Un paiement est conservé dans l’historique : annulez-le puis ajoutez une correction'; end if;
 if tg_op='UPDATE' and old.cancelled then raise exception 'Un paiement annulé ne peut pas être réactivé'; end if;
 if new.document_id is not null then
   select * into target from public.documents where id=new.document_id for update;
   if target.type<>'facture' then raise exception 'Le paiement doit être lié à une facture'; end if;
   select coalesce(sum(amount),0)+target.finance_initial_paid into total_paid from public.finance_payments where document_id=new.document_id and not cancelled and id<>new.id;
   if not new.cancelled and total_paid+new.amount>target.total_ttc then raise exception 'Le paiement dépasse le restant de la facture'; end if;
 else
   select * into expense from public.finance_expenses where id=new.expense_id for update;
   if expense.archived then raise exception 'Cette dépense est archivée'; end if;
   select coalesce(sum(amount),0) into total_paid from public.finance_payments where expense_id=new.expense_id and not cancelled and id<>new.id;
   if not new.cancelled and total_paid+new.amount>expense.amount_ht+expense.amount_vat then raise exception 'Le paiement dépasse le restant de la dépense'; end if;
 end if;
 return new;
end $body$;
create trigger finance_payment_guard before insert or update on public.finance_payments for each row execute function private.finance_payment_guard();
create or replace function private.finance_payment_sync() returns trigger language plpgsql security invoker set search_path=pg_catalog,public as $body$
begin
 if new.document_id is not null then update public.documents set paid_amount=paid_amount where id=new.document_id; end if;
 return new;
end $body$;
create trigger finance_payment_sync after insert or update on public.finance_payments for each row execute function private.finance_payment_sync();
create or replace function private.finance_expense_guard() returns trigger language plpgsql security invoker set search_path=pg_catalog,public as $body$
declare paid numeric;
begin
 select coalesce(sum(amount),0) into paid from public.finance_payments where expense_id=new.id and not cancelled;
 if new.amount_ht+new.amount_vat<paid or (new.archived and paid>0) then raise exception 'Annulez les paiements avant de réduire ou archiver cette dépense'; end if;
 if new.document_id is not null and not exists(select 1 from public.documents where id=new.document_id and type='facture') then raise exception 'Le dossier doit être une facture'; end if;
 new.updated_at:=now(); return new;
end $body$;
create trigger finance_expense_guard before insert or update on public.finance_expenses for each row execute function private.finance_expense_guard();

insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types) values('faste-finance','faste-finance',false,10485760,array['application/pdf','image/jpeg','image/png','image/webp','image/heic','image/heif']);
create policy faste_finance_files_select on storage.objects for select to authenticated using(bucket_id='faste-finance' and (select auth.uid())=any(array['108241bf-f493-46fd-b09d-eee3de67e08a'::uuid,'4de67d73-40b2-43e9-8063-76899188ba18'::uuid]));
create policy faste_finance_files_insert on storage.objects for insert to authenticated with check(bucket_id='faste-finance' and (select auth.uid())=any(array['108241bf-f493-46fd-b09d-eee3de67e08a'::uuid,'4de67d73-40b2-43e9-8063-76899188ba18'::uuid]));
-- Suppression réservée au nettoyage d'un upload échoué avant rattachement ; pièces rattachées conservées.
create policy faste_finance_files_cleanup on storage.objects for delete to authenticated using(bucket_id='faste-finance' and not exists(select 1 from public.finance_attachments a where a.path=name) and (select auth.uid())=any(array['108241bf-f493-46fd-b09d-eee3de67e08a'::uuid,'4de67d73-40b2-43e9-8063-76899188ba18'::uuid]));
create or replace function private.finance_attachment_guard() returns trigger language plpgsql security invoker set search_path=pg_catalog,public,storage as $body$
begin
 if tg_op='UPDATE' then raise exception 'Les pièces rattachées sont conservées ; ajoutez une nouvelle pièce'; end if;
 if not exists(select 1 from storage.objects where bucket_id='faste-finance' and name=new.path) then raise exception 'Justificatif non téléversé'; end if;
 return new;
end $body$;
create trigger finance_attachment_guard before insert or update on public.finance_attachments for each row execute function private.finance_attachment_guard();
revoke all on function private.finance_document_totals(),private.finance_payment_guard(),private.finance_payment_sync(),private.finance_expense_guard(),private.finance_attachment_guard() from public;
grant execute on function private.finance_document_totals(),private.finance_payment_guard(),private.finance_payment_sync(),private.finance_expense_guard(),private.finance_attachment_guard() to authenticated;
