/* Journal unique de gestion. Pièces et mouvements bancaires restent dans des colonnes distinctes. */
(function(root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory(require('./finance-core.js'));
  else root.FasteExport = factory(root.FasteFinance);
})(typeof globalThis !== 'undefined' ? globalThis : this, function(F) {
  'use strict';
  const headers = ['Date', 'Type', 'Référence', 'Client / fournisseur', 'Événement / catégorie', 'Pièce liée', 'Libellé / détail', 'Échéance', 'HT (€)', 'TVA (€)', 'TTC (€)', 'Entrée banque (€)', 'Sortie banque (€)', 'Frais avancés associé (€)', 'Payeur / bénéficiaire', 'Statut', 'TVA déductible (€)', 'Reste à fin période (€)', 'Justificatifs / PDF', 'Notes', 'Indicateur (€)', 'Marge (%)', 'ID'];
  const safe = s => String(s).replace(/[^a-zA-Z0-9_-]/g, '_');
  const pdfPath = d => 'factures_clients/' + d.id + '-' + safe(d.number) + '.pdf';
  const creditPath = c => 'avoirs_clients/' + c.id + '-' + safe(c.number) + '.pdf';
  const originalPath = a => 'justificatifs/' + a.id + '-' + a.filename;
  function journal(data, from, to) {
    const within = date => date && date >= from && date <= to;
    const docs = data.documents || [], expenses = data.expenses || [], payments = data.payments || [], flows = data.flows || [], credits = data.credits || [], attachments = data.attachments || [];
    const rows = [], doc = id => docs.find(d => d.id === id), expense = id => expenses.find(e => e.id === id);
    const client = d => d?.contact?.name || (data.contacts || []).find(c => c.id === d?.contact_id)?.name || '';
    const event = d => (data.events || []).find(e => d?.source_quote_id && e.source_quote_id === d.source_quote_id)?.title || d?.event_type || '';
    const dossier = e => (data.events || []).find(x => x.id === e?.event_id)?.title || (e?.document_id ? event(doc(e.document_id)) || doc(e.document_id)?.number : '') || 'Frais généraux FASTE';
    const files = (key, id) => id ? attachments.filter(a => a[key] === id).map(originalPath) : [];
    const add = (values, info = false) => rows.push({ values: headers.map(h => values[h] ?? null), info });
    const selectedPayments = payments.filter(p => within(p.payment_date)), selectedCredits = credits.filter(c => within(c.document_date));
    const docIds = new Set([...selectedPayments.map(p => p.document_id), ...selectedCredits.map(c => c.document_id)]), expenseIds = new Set(selectedPayments.map(p => p.expense_id));
    docs.filter(d => d.type === 'facture' && (within(d.document_date) || docIds.has(d.id))).forEach(d => {
      const current = within(d.document_date), remaining = F.remainingDoc(d, payments, to, credits);
      add({'Date':d.document_date, 'Type':current ? 'Facture client' : 'Pièce liée hors période', 'Référence':d.number, 'Client / fournisseur':client(d), 'Événement / catégorie':event(d), 'Pièce liée':doc(d.source_quote_id)?.number, 'Libellé / détail':(data.lines || []).filter(l => l.document_id === d.id).map(l => `${l.description} — ${l.quantity} × ${l.unit_price_ht} € HT, TVA ${l.vat_rate} %`).join('\n'), 'Échéance':d.due_date, 'HT (€)':current ? Number(d.total_ht) : null, 'TVA (€)':current ? Number(d.total_vat) : null, 'TTC (€)':current ? Number(d.total_ttc) : null, 'Statut':remaining === 0 ? 'Soldée' : F.docPaid(d,payments,to)>0 ? 'Partiellement encaissée' : 'À encaisser', 'Reste à fin période (€)':remaining, 'Justificatifs / PDF':[pdfPath(d),...files('document_id',d.id)].join('\n'), 'Notes':[current ? '' : `Hors période : pièce de ${d.total_ttc} € TTC, exclue des montants de la période.`, Number(d.finance_initial_paid)>0 ? `Encaissement historique sans date : ${d.finance_initial_paid} € ; non ajouté à la banque.` : '', d.notes || ''].filter(Boolean).join(' '), 'ID':d.id}, !current);
    });
    selectedCredits.forEach(c => { const d=doc(c.document_id), cancelled=c.cancelled;
      add({'Date':c.document_date,'Type':'Avoir client','Référence':c.number,'Client / fournisseur':client(d),'Événement / catégorie':event(d),'Pièce liée':d?.number,'Libellé / détail':c.reason,'HT (€)':cancelled ? 0 : -Number(c.amount_ht),'TVA (€)':cancelled ? 0 : -Number(c.amount_vat),'TTC (€)':cancelled ? 0 : -F.expenseTtc(c),'Statut':cancelled ? 'Annulé' : 'Imputé sur facture','Justificatifs / PDF':creditPath(c),'Notes':cancelled ? `Avoir annulé : ${F.expenseTtc(c)} € TTC. Sans incidence dans les totaux.` : 'Réduction de facturation. Aucun mouvement bancaire.','ID':c.id});
    });
    expenses.filter(e => within(e.document_date) || expenseIds.has(e.id)).forEach(e => {
      const current=within(e.document_date), counted=current && !e.archived, paid=F.paidExpense(e,payments,to);
      add({'Date':e.document_date,'Type':current ? 'Dépense fournisseur' : 'Pièce liée hors période','Référence':e.reference,'Client / fournisseur':e.supplier,'Événement / catégorie':dossier(e) + ' · ' + e.category,'Pièce liée':doc(e.document_id)?.number,'Libellé / détail':({'charge':'Charge','investment':'Investissement','advance':'Acompte fournisseur'})[e.kind],'Échéance':e.due_date,'HT (€)':counted ? Number(e.amount_ht) : null,'TVA (€)':counted ? Number(e.amount_vat) : null,'TTC (€)':counted ? F.expenseTtc(e) : null,'Statut':e.archived ? 'Archivée' : e.provisional ? 'À vérifier sur justificatif' : paid>=F.expenseTtc(e) ? 'Payée' : paid>0 ? 'Partiellement payée' : 'À payer','TVA déductible (€)':counted && e.deduction_status==='yes' ? Number(e.deductible_vat) : null,'Reste à fin période (€)':Math.max(0,F.money(F.cents(F.expenseTtc(e))-F.cents(paid))),'Justificatifs / PDF':files('expense_id',e.id).join('\n'),'Notes':[!current ? `Hors période : pièce de ${F.expenseTtc(e)} € TTC, exclue des montants de la période.` : '', e.provisional ? 'Estimation récurrente : à vérifier avant comptabilisation.' : '', e.deduction_status==='unknown' ? 'TVA récupérable à confirmer.' : e.deduction_status==='no' ? 'TVA non récupérable.' : '', e.notes || ''].filter(Boolean).join(' '),'ID':e.id}, !current);
    });
    selectedPayments.forEach(p => {
      const d=doc(p.document_id), e=expense(p.expense_id), bank=p.payer==='bank', value=p.cancelled ? 0 : Number(p.amount);
      add({'Date':p.payment_date,'Type':d ? 'Encaissement client' : bank ? 'Paiement fournisseur' : 'Frais avancés associé','Référence':p.reference,'Client / fournisseur':d ? client(d) : e?.supplier,'Événement / catégorie':d ? event(d) : dossier(e),'Pièce liée':d?.number || e?.reference,'Libellé / détail':d ? 'Paiement de facture / acompte reçu' : 'Règlement de dépense','Entrée banque (€)':bank && d ? value : null,'Sortie banque (€)':bank && e ? value : null,'Frais avancés associé (€)':!bank ? value : null,'Payeur / bénéficiaire':bank ? 'Compte FASTE' : p.payer,'Statut':p.cancelled ? 'Annulé' : 'Réalisé','Justificatifs / PDF':[...files('payment_id',p.id),...(d ? [pdfPath(d),...files('document_id',d.id)] : files('expense_id',e?.id))].join('\n'),'Notes':p.cancelled ? `Paiement annulé de ${p.amount} € : exclu des mouvements.` : !bank ? 'Avancé personnellement ; sans mouvement sur le compte FASTE.' : 'Mouvement bancaire uniquement ; ne crée pas une nouvelle facture/dépense.','ID':p.id});
    });
    flows.filter(f => within(f.flow_date)).forEach(f => { const value=f.realized && !f.cancelled ? Number(f.amount) : 0;
      add({'Date':f.flow_date,'Type':'Autre mouvement','Référence':f.id,'Événement / catégorie':f.category,'Libellé / détail':f.label,'Entrée banque (€)':value>0 ? value : null,'Sortie banque (€)':value<0 ? -value : null,'Payeur / bénéficiaire':f.beneficiary || 'Compte FASTE','Statut':f.cancelled ? 'Annulé' : f.realized ? 'Réalisé' : 'Prévu','Justificatifs / PDF':files('flow_id',f.id).join('\n'),'Notes':!f.realized ? `Prévision : ${f.amount} €, non comptée dans les mouvements réalisés.` : '', 'ID':f.id});
    });
    docs.filter(d => d.type==='devis' && d.status==='accepted' && d.document_date<=to && !docs.some(i => i.type==='facture' && i.source_quote_id===d.id)).forEach(d => add({'Date':d.document_date,'Type':'Devis à facturer','Référence':d.number,'Client / fournisseur':client(d),'Événement / catégorie':event(d),'Statut':'Information — non facturé','Notes':`Devis accepté de ${d.total_ttc} € TTC : exclu de la facturation et des mouvements.`,'ID':d.id},true));
    F.eventRows(data,to).forEach(r => add({'Date':to,'Type':'Synthèse marge','Client / fournisseur':r.quote?.contact?.name || r.docs[0]?.contact?.name,'Événement / catégorie':r.title,'Statut':'Information — cumul à fin de période','Notes':`Recettes nettes HT ${r.billed} € ; coûts directs ${r.costs} €. Avant frais généraux non alloués, rémunération et amortissements.`,'Indicateur (€)':r.margin,'Marge (%)':r.rate,'ID':r.id},true));
    const snapshot=F.snapshot(data,to);
    [['Trésorerie calculée',snapshot.cash],['BFR opérationnel estimé',snapshot.bfr],['Solde bancaire de référence',data.settings.balance_amount]].forEach(([label,value]) => add({'Date':to,'Type':'Situation','Libellé / détail':label,'Statut':'Information — ne pas additionner aux pièces','Notes':label==='Solde bancaire de référence' ? 'Date du solde : '+(data.settings.balance_date || 'non renseignée') : 'Estimation de gestion ; à rapprocher des pièces et du relevé.','Indicateur (€)':value},true));
    rows.sort((a,b) => Number(a.info)-Number(b.info) || String(a.values[0] || '').localeCompare(String(b.values[0] || '')) || String(a.values[1]).localeCompare(String(b.values[1])));
    return [headers,...rows.map(r => r.values)];
  }
  return { journal, headers };
});
