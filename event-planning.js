/* Prévisions internes et disponibilités. Aucune estimation ne crée une écriture financière. */
(function(root,factory){if(typeof module==='object'&&module.exports)module.exports=factory(require('./finance-core.js'));else root.FastePlanning=factory(root.FasteFinance);})(typeof globalThis!=='undefined'?globalThis:this,function(F){
 'use strict';
 const same=(a,b)=>a.kind===b.kind&&(a.kind==='material'?a.material_id===b.material_id:a.kind==='team'?a.member_id===b.member_id:a.contact_id===b.contact_id);
 const overlap=(a,b)=>Date.parse(a.starts_at)<Date.parse(b.ends_at)&&Date.parse(b.starts_at)<Date.parse(a.ends_at);
 function forecast(plan={},quote={}){
  const costs=F.sum(plan.costs||[],c=>c.amount),revenue=Number(quote.total_ht||0),margin=F.money(F.cents(revenue)-F.cents(costs));
  const hours=['preparation_hours','setup_hours','operation_hours','teardown_hours'].reduce((n,k)=>n+Number(plan[k]||0),0),timeValue=F.money(F.cents(hours*Number(plan.hourly_value||0)));
  const totalClient=F.money(F.cents(quote.total_ttc)+F.cents(plan.external_client_ttc));
  const budget=plan.client_budget_ttc==null||plan.client_budget_ttc===''?null:Number(plan.client_budget_ttc);
  return {revenue,costs,margin,rate:revenue>0?margin/revenue*100:null,hours,timeValue,afterTime:F.money(F.cents(margin)-F.cents(timeValue)),totalClient,budget,gap:budget==null?null:F.money(F.cents(budget)-F.cents(totalClient)),checked:plan.costs_checked===true};
 }
 function conflicts(candidate,bookings,materials,confirmedOnly=false){
  if(candidate.status==='cancelled')return null;
  const matches=bookings.filter(b=>b.id!==candidate.id&&b.status!=='cancelled'&&(!confirmedOnly||b.status==='confirmed')&&same(b,candidate)&&overlap(b,candidate));
  const capacity=candidate.kind==='material'?Number(materials.find(m=>m.id===candidate.material_id)?.quantite||0):1;
  const points=[Date.parse(candidate.starts_at),...matches.map(b=>Date.parse(b.starts_at)).filter(t=>t>=Date.parse(candidate.starts_at)&&t<Date.parse(candidate.ends_at))];
  let peak=Number(candidate.quantity||1);
  for(const t of points)peak=Math.max(peak,Number(candidate.quantity||1)+matches.filter(b=>Date.parse(b.starts_at)<=t&&Date.parse(b.ends_at)>t).reduce((n,b)=>n+Number(b.quantity||1),0));
  if(candidate.kind==='supplier')return matches.length?{type:'supplier',capacity,peak,bookings:matches}:null;
  return peak>capacity?{type:candidate.kind,capacity,peak,bookings:matches}:null;
 }
 function parisInput(iso){if(!iso)return '';const parts=new Intl.DateTimeFormat('sv-SE',{timeZone:'Europe/Paris',year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',hourCycle:'h23'}).format(new Date(iso));return parts.replace(' ','T');}
 function parisUTC(value){
  if(!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(value))throw new Error('Date et heure complètes nécessaires.');
  const base=Date.parse(value+'Z');if(!Number.isFinite(base))throw new Error('Horaire invalide.');
  const candidates=[base-3600000,base-7200000].filter(t=>parisInput(new Date(t).toISOString())===value);
  if(candidates.length!==1)throw new Error(candidates.length?'Horaire ambigu au changement d’heure : choisissez un horaire non ambigu.':'Horaire inexistant ou date invalide en heure française.');
  return new Date(candidates[0]).toISOString();
 }
 return {forecast,conflicts,overlap,parisInput,parisUTC};
});
