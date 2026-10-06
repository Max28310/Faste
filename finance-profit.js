/* Résultats de gestion par exercice de 12 mois. IS estimé, jamais une déclaration fiscale. */
(function(root,factory) {
 if(typeof module==='object' && module.exports) module.exports=factory(require('./finance-core.js'));
 else root.FasteProfit=factory(root.FasteFinance);
})(typeof globalThis!=='undefined' ? globalThis : this,function(F) {
 'use strict';
 const day = d => d.toISOString().slice(0,10);
 const before = date => day(new Date(new Date(date+'T12:00:00Z').getTime()-86400000));
 function fiscalYear(date, month=1) { return Number(date.slice(0,4))-(Number(date.slice(5,7))<month ? 1 : 0); }
 function bounds(year,month=1) { const from=day(new Date(Date.UTC(Number(year),month-1,1,12))); return {from,to:before(day(new Date(Date.UTC(Number(year)+1,month-1,1,12))))}; }
 function total(data,from,to) {
  const within=date => date && date>=from && date<=to;
  const invoices=(data.documents||[]).filter(d => d.type==='facture' && within(d.document_date));
  const creditIds=new Set((data.documents||[]).filter(d => d.type==='facture').map(d => d.id));
  const credits=(data.credits||[]).filter(c => !c.cancelled && creditIds.has(c.document_id) && within(c.document_date));
  const revenue=F.money(F.cents(F.sum(invoices,d => d.total_ht))-F.cents(F.sum(credits,c => c.amount_ht)));
  const expenses=(data.expenses||[]).filter(e => !e.archived && e.kind==='charge' && within(e.document_date));
  const direct=F.sum(expenses.filter(e => e.event_id || e.document_id),F.cost), overhead=F.sum(expenses.filter(e => !e.event_id && !e.document_id),F.cost);
  const adjustments=(data.adjustments||[]).filter(a => !a.cancelled && within(a.document_date));
  const nonCash=F.sum(adjustments.filter(a => !['tax_addback','tax_deduction'].includes(a.category)),a => a.amount);
  const fiscal=F.sum(adjustments.filter(a => ['tax_addback','tax_deduction'].includes(a.category)),a => a.amount);
  const pretax=F.money(F.cents(revenue)-F.cents(direct)-F.cents(overhead)+F.cents(nonCash));
  return {revenue,direct,overhead,nonCash,fiscal,pretax,taxable:F.money(F.cents(pretax)+F.cents(fiscal)),pendingVat:expenses.some(e => e.deduction_status==='unknown'),provisional:expenses.some(e => e.provisional)};
 }
 function tax(profit,reduced=false) { const base=Math.max(0,F.cents(profit)); return F.money(reduced ? Math.round(Math.min(base,4250000)*.15+Math.max(0,base-4250000)*.25) : Math.round(base*.25)); }
 function period(data,from,to,yearFrom) {
  const s=total(data,from,to), end=total(data,yearFrom,to), start=total(data,yearFrom,before(from));
  const fiscalYearRevenue=total(data,yearFrom,bounds(fiscalYear(yearFrom,Number(data.settings?.fiscal_start_month||1)),Number(data.settings?.fiscal_start_month||1)).to).revenue;
  const reduced=data.settings?.reduced_is_confirmed===true && fiscalYearRevenue<=10000000;
  const is=F.money(F.cents(tax(end.taxable,reduced))-F.cents(tax(start.taxable,reduced))), after=F.money(F.cents(s.pretax)-F.cents(is));
  return {...s,from,to,is,after,beforeRate:s.revenue>0 ? s.pretax/s.revenue*100 : null,afterRate:s.revenue>0 ? after/s.revenue*100 : null,reduced};
 }
 function periods(data,year,mode='monthly',asOf) {
  const month=Number(data.settings?.fiscal_start_month||1), fiscal=bounds(year,month), length=mode==='annual' ? 12 : mode==='quarterly' ? 3 : 1;
  const rows=[];
  for(let i=0;i<12;i+=length) {
   const from=day(new Date(Date.UTC(Number(year),month-1+i,1,12))), end=before(day(new Date(Date.UTC(Number(year),month-1+i+length,1,12))));
   const actualEnd=asOf && asOf<end ? asOf : end;
   const r=asOf && from>asOf ? {...total(data,from,before(from)),is:0,after:0,beforeRate:null,afterRate:null,reduced:data.settings?.reduced_is_confirmed===true} : period(data,from,actualEnd,fiscal.from);
   rows.push({...r,to:end,actualTo:actualEnd,future:!!asOf && from>asOf,label:mode==='annual' ? `Exercice ${year}${month!==1 ? '/'+(Number(year)+1) : ''}` : mode==='quarterly' ? `Trimestre ${i/3+1} (${from} → ${end})` : from.slice(0,7)});
  }
  return rows;
 }
 function range(data,from,to) {
  const month=Number(data.settings?.fiscal_start_month||1), rows=[];
  for(let y=fiscalYear(from,month);y<=fiscalYear(to,month);y++) { const b=bounds(y,month); rows.push(period(data,from>b.from ? from : b.from,to<b.to ? to : b.to,b.from)); }
  return rows;
 }
 return {total,tax,period,periods,range,fiscalYear,bounds};
});
