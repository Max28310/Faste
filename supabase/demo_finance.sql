-- Jeu fictif demandé par Maxime. Numérotation TEST séparée des documents commerciaux.
-- Transaction idempotente : aucun remplacement de données existantes.
begin;
do $body$
declare c uuid; q uuid; i uuid; e uuid; r uuid; k integer; ht numeric; invoice_day date; event_day date;
begin
 if exists(select 1 from public.contacts where legacy_id='demo-finance-20261006-1') then raise exception 'Le jeu TEST existe déjà'; end if;
 for k in 1..4 loop
  ht:=case k when 1 then 3000 when 2 then 2000 when 3 then 5000 else 1500 end;
  invoice_day:='2026-10-06'; event_day:=case when k<=2 then '2026-10-05'::date else '2026-12-19'::date end;
  insert into public.contacts(type,relation_status,name,legacy_id,notes)
  values('client','client',case k when 1 then 'TEST — Client facturé et payé' when 2 then 'TEST — Client avec avoir' when 3 then 'TEST — Client avec acompte' else 'TEST — Client à facturer' end,'demo-finance-20261006-'||k,'EXEMPLE FICTIF — ne pas envoyer, ne pas comptabiliser.') returning id into c;
  insert into public.documents(type,number,contact_id,event_type,event_date,document_date,status,total_ht,total_vat,total_ttc,notes)
  values('devis','TEST-DEV-20261006-'||k,c,case k when 1 then 'Son lumière DJ' when 2 then 'Organisation de réception' when 3 then 'Production événementielle' else 'Mariage en préparation' end,event_day,invoice_day,'accepted',ht,ht*.2,ht*1.2,'EXEMPLE FICTIF — test export uniquement.') returning id into q;
  insert into public.document_lines(document_id,description,quantity,unit_price_ht,vat_rate,line_total_ht,line_total_vat,line_total_ttc,position)
  values(q,'TEST — Prestation événementielle fictive',1,ht,20,ht,ht*.2,ht*1.2,1);
  select id into e from public.event_sheets where source_quote_id=q;
  if k<=2 then update public.event_sheets set status='completed' where id=e; end if;
  if k<4 then
   insert into public.documents(type,number,contact_id,source_quote_id,event_type,event_date,document_date,due_date,status,total_ht,total_vat,total_ttc,notes)
   values('facture','TEST-FAC-20261006-'||k,c,q,'TEST — Prestation événementielle',event_day,invoice_day,'2026-10-20','unpaid',ht,ht*.2,ht*1.2,'EXEMPLE FICTIF — test export uniquement.') returning id into i;
   insert into public.document_lines(document_id,description,quantity,unit_price_ht,vat_rate,line_total_ht,line_total_vat,line_total_ttc,position)
   values(i,'TEST — Prestation événementielle fictive',1,ht,20,ht,ht*.2,ht*1.2,1);
   if k=1 or k=3 then
    insert into public.finance_payments(document_id,amount,payment_date,payer,reference) values(i,case k when 1 then 3600 else 1800 end,invoice_day,'bank','TEST — Virement fictif');
   end if;
   if k=2 then insert into public.finance_credits(document_id,number,document_date,reason,amount_ht,amount_vat) values(i,'TEST-AV-20261006-1',invoice_day,'TEST — Geste commercial fictif',200,40); end if;
  end if;
  if k=1 then
   insert into public.finance_expenses(event_id,supplier,reference,document_date,due_date,category,kind,amount_ht,amount_vat,deduction_status,deductible_vat,notes)
   values(e,'TEST — Loueur matériel','TEST-LOC-20261006',invoice_day,invoice_day,'Location matériel','charge',600,120,'yes',120,'EXEMPLE FICTIF') returning id into r;
   insert into public.finance_payments(expense_id,amount,payment_date,payer,reference) values(r,720,invoice_day,'bank','TEST — Règlement location');
   insert into public.finance_expenses(event_id,supplier,reference,document_date,due_date,category,kind,amount_ht,amount_vat,deduction_status,deductible_vat,notes)
   values(e,'TEST — Transport','TEST-TRA-20261006',invoice_day,invoice_day,'Transport','charge',100,20,'unknown',0,'EXEMPLE FICTIF — TVA à vérifier') returning id into r;
   insert into public.finance_payments(expense_id,amount,payment_date,payer,reference) values(r,120,invoice_day,'Maxime','TEST — Frais avancés');
  elsif k=3 then
   insert into public.finance_expenses(event_id,supplier,reference,document_date,due_date,category,kind,amount_ht,amount_vat,deduction_status,deductible_vat,notes)
   values(e,'TEST — Prestataire technique','TEST-PRE-20261006',invoice_day,'2026-10-20','Prestataires','charge',500,100,'yes',100,'EXEMPLE FICTIF — reste à payer');
  end if;
 end loop;
 insert into public.finance_recurring(supplier,label,category,amount_ht,amount_vat,start_date,end_date,day_of_month,notes)
 values('TEST — Assurance','TEST — Assurance mensuelle','Assurance',90,0,'2026-10-06','2026-10-31',6,'EXEMPLE FICTIF — limité à octobre pour ne pas créer de nouvelles données de test les mois suivants.');
 insert into public.finance_recurring(supplier,label,category,amount_ht,amount_vat,start_date,end_date,day_of_month,notes)
 values('TEST — Logiciel','TEST — Abonnement mensuel','Logiciels',25,5,'2026-10-06','2026-10-31',6,'EXEMPLE FICTIF — limité à octobre.');
 perform private.finance_generate_recurring();
 -- La référence 0 € du 6 octobre était celle de l'essai précédent. Aucun autre mouvement n'existe.
 if not exists(select 1 from public.finance_payments where reference not like 'TEST%') and not exists(select 1 from public.finance_flows) then
  update public.finance_settings set balance_date='2026-10-05' where id=1 and balance_date='2026-10-06' and balance_amount=0;
 end if;
end $body$;
commit;
