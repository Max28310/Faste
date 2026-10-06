/* Module financier intégré à Gestion FASTE. */
'use strict';
const FinanceUI = (() => {
  const F = FasteFinance;
  let data = { expenses: [], payments: [], flows: [], attachments: [], settings: {}, recurring: [], credits: [] };
  let ready = false, errorMessage = '', editing = null, busy = false, pendingId = null;
  const model = () => ({ ...data, documents: state.documents, events: state.events });
  const pct = n => n == null ? '—' : new Intl.NumberFormat('fr-FR', { maximumFractionDigits: 1 }).format(n) + ' %';
  const localDate = () => new Intl.DateTimeFormat('fr-CA', { timeZone: 'Europe/Paris', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());
  const categoryChoices = ['Location matériel', 'Prestataires', 'Transport', 'Hébergement', 'Communication', 'Assurance', 'Logiciels', 'Banque', 'Comptabilité', 'Matériel', 'Autre'].map(s => [s, s]);
  async function all(table) {
    const rows = [];
    for (let start = 0; ; start += 500) {
      const r = await db.from(table).select('*').order('id').range(start, start + 499);
      if (r.error) throw r.error;
      rows.push(...r.data); if (r.data.length < 500) return rows;
    }
  }
  async function load() {
    try {
      const generation = await db.rpc('finance_generate_recurring'); if (generation.error) throw generation.error;
      const results = await Promise.all(['finance_expenses', 'finance_payments', 'finance_flows', 'finance_attachments', 'finance_settings', 'finance_recurring', 'finance_credits'].map(all));
      [data.expenses, data.payments, data.flows, data.attachments] = results;
      data.settings = results[4][0] || {}; data.recurring = results[5]; data.credits = results[6]; ready = true; errorMessage = '';
    } catch (e) { ready = false; errorMessage = e.message || 'Chargement impossible'; }
  }
  function card(label, value, detail, negative = false) { return `<article class="kpi"><span>${label}</span><strong class="${negative ? 'negative' : ''}">${value}</strong><small>${detail}</small></article>`; }
  const button = (label, action, id = '', cls = 'mini-btn') => `<button type="button" class="${cls}" data-finance-action="${action}" data-id="${esc(id)}">${label}</button>`;
  function render() {
    if (!$('#financeOverview')) return;
    $('#financeError').textContent = ready ? '' : `Suivi financier indisponible : ${errorMessage || 'chargement en cours'}. Actualisez avant de saisir.`;
    $('#financeError').hidden = ready;
    $('#page-finance').querySelectorAll('[data-finance-action], #financeExportForm button').forEach(b => b.disabled = !ready || busy);
    if (!ready) { $('#financeOverview').innerHTML = ''; return; }
    const asOf = localDate(), m = model(), s = F.snapshot(m, asOf);
    $('#financeTestNotice').hidden = !state.documents.some(d => d.number?.startsWith('TEST-'));
    $('#financeOverview').innerHTML = [card('Sur le compte', s.cash == null ? 'À renseigner' : euro(s.cash), s.cash == null ? 'Ajoutez un solde bancaire vérifié.' : 'Solde de référence + paiements saisis ; à rapprocher du relevé.', s.cash < 0), card('Clients : reste à encaisser', euro(s.due), 'Factures émises, acomptes déjà déduits.'), card('Fournisseurs : reste à payer', euro(s.payable), 'Factures de dépenses non soldées.'), card('BFR opérationnel estimé', euro(s.bfr), 'Voir le détail dans Mon argent.')].join('');
    const search = ($('#financeEventSearch').value || '').toLowerCase();
    const rows = F.eventRows(m, asOf).filter(r => `${r.title} ${r.quote?.contact?.name || r.docs[0]?.contact?.name || ''}`.toLowerCase().includes(search));
    $('#financeEventsBody').innerHTML = rows.length ? rows.map(r => `<tr><td><strong>${esc(r.title)}</strong><span class="cell-sub">${esc(r.quote?.contact?.name || r.docs[0]?.contact?.name || '')} · ${dateFr(r.date)}</span></td><td>${euro(r.quote?.total_ht || 0)}</td><td>${euro(r.billed)}</td><td>${euro(r.costs)}${r.pendingVat ? '<span class="cell-sub">TVA déductible à vérifier</span>' : ''}</td><td class="${r.margin < 0 ? 'negative-cell' : 'positive-cell'}"><strong>${euro(r.margin)}</strong><span class="cell-sub">${pct(r.rate)} du facturé HT</span></td><td>${euro(r.received)}</td><td>${euro(r.due)}</td><td>${euro(r.payable)}</td><td>${button('Ajouter une dépense', 'expense', r.id)} ${r.docs.map(d => button('Encaisser ' + esc(d.number), 'receipt', d.id)).join(' ')}</td></tr>`).join('') : '<tr><td colspan="9"><div class="empty-state">Vos événements apparaissent dès qu’un devis est accepté. Les factures sans devis lié apparaissent aussi.</div></td></tr>';
    const q = ($('#financeExpenseSearch').value || '').toLowerCase();
    $('#financeExpensesBody').innerHTML = data.expenses.filter(e => !e.archived && `${e.supplier} ${e.reference} ${e.category}`.toLowerCase().includes(q)).map(e => {
      const paid = F.paidExpense(e, data.payments, asOf), due = F.money(F.cents(F.expenseTtc(e)) - F.cents(paid));
      const event = state.events.find(x => x.id === e.event_id), doc = state.documents.find(x => x.id === e.document_id);
      return `<tr><td><strong>${esc(e.supplier)}</strong><span class="cell-sub">${esc(e.reference)} · ${esc(e.category)}${e.provisional ? ' · À vérifier' : ''}</span></td><td>${esc(event?.title || doc?.number || 'Frais généraux FASTE')}<span class="cell-sub">${({ charge: 'Dépense courante', investment: 'Investissement', advance: 'Acompte fournisseur' })[e.kind]}</span></td><td>${euro(F.expenseTtc(e))}</td><td>${dateFr(e.due_date)}</td><td>${euro(due)}</td><td>${data.attachments.filter(a => a.expense_id === e.id).length} pièce(s)</td><td>${button('Ouvrir', 'edit-expense', e.id)} ${due > 0 ? button('Payer', 'payment', e.id) : '<span class="badge paid">Payé</span>'} ${button('Justificatifs', 'files-expense', e.id)}</td></tr>`;
    }).join('') || '<tr><td colspan="7"><div class="empty-state">Ajoutez une facture fournisseur ou un ticket. Vous pourrez joindre une photo ou un PDF.</div></td></tr>';
    const invoices = state.documents.filter(d => d.type === 'facture');
    $('#financeInvoicesBody').innerHTML = invoices.map(d => `<tr><td>${esc(d.number)}<span class="cell-sub">${esc(d.contact?.name || '')}</span></td><td>${euro(d.total_ttc)}<span class="cell-sub">Avoirs : ${euro(F.credited(d, data.credits, asOf))}</span></td><td>${euro(F.docPaid(d, data.payments, asOf))}</td><td>${euro(F.remainingDoc(d, data.payments, asOf, data.credits))}</td><td>${dateFr(d.due_date)}</td><td>${button('Enregistrer un encaissement', 'receipt', d.id)} ${button('Ajouter un avoir', 'credit', d.id)} ${button('Justificatifs', 'files-document', d.id)}</td></tr>`).join('') || '<tr><td colspan="6"><div class="empty-state">Créez une facture depuis Devis & Factures.</div></td></tr>';
    $('#financeRecurringBody').innerHTML = data.recurring.map(r => `<tr><td>${esc(r.supplier)}<span class="cell-sub">${esc(r.label)}</span></td><td>${euro(F.expenseTtc(r))}</td><td>Le ${r.day_of_month} · ${dateFr(r.start_date)}${r.end_date ? ' → ' + dateFr(r.end_date) : ''}</td><td>${r.active ? 'Active' : 'En pause'}</td><td>${button('Modifier', 'edit-recurring', r.id)} ${button(r.active ? 'Mettre en pause' : 'Reprendre', r.active ? 'pause-recurring' : 'resume-recurring', r.id)}</td></tr>`).join('') || '<tr><td colspan="5">Aucune dépense récurrente. Ajoutez une assurance ou un abonnement mensuel.</td></tr>';
    $('#financeCreditsBody').innerHTML = data.credits.map(c => `<tr><td>${esc(c.number)}<span class="cell-sub">${esc(state.documents.find(d => d.id === c.document_id)?.number || '')}</span></td><td>${dateFr(c.document_date)}</td><td>${esc(c.reason)}</td><td>−${euro(F.expenseTtc(c))}</td><td>${c.cancelled ? 'Annulé' : button('Annuler la saisie', 'cancel-credit', c.id)}</td></tr>`).join('') || '<tr><td colspan="5">Aucun avoir.</td></tr>';
    $('#financePaymentsBody').innerHTML = [...data.payments].sort((a, b) => b.payment_date.localeCompare(a.payment_date)).map(p => `<tr><td>${dateFr(p.payment_date)}</td><td>${esc(state.documents.find(d => d.id === p.document_id)?.number || data.expenses.find(e => e.id === p.expense_id)?.supplier || '')}<span class="cell-sub">${esc(p.reference)}</span></td><td>${p.document_id ? '+' : '−'}${euro(p.amount)}</td><td>${p.payer === 'bank' ? 'Compte FASTE' : esc(p.payer)}</td><td>${p.cancelled ? 'Annulé' : button('Annuler le paiement', 'cancel-payment', p.id)} ${button('Pièces', 'files-payment', p.id)}</td></tr>`).join('') || '<tr><td colspan="5"><div class="empty-state">Les nouveaux paiements seront datés et conservés ici.</div></td></tr>';
    const f = F.forecast(m, asOf);
    $('#financeForecastBody').innerHTML = f.rows.map(r => `<tr><td>${r.month}</td><td>${euro(r.incoming)}</td><td>${euro(r.outgoing)}</td><td class="${r.balance < 0 ? 'negative-cell' : ''}">${r.balance == null ? 'Solde initial à renseigner' : euro(r.balance)}</td></tr>`).join('');
    $('#financeOverdue').textContent = f.overdue.length ? `${f.overdue.length} paiement(s) en retard ou sans échéance : ${f.overdue.map(x => x.label + ' (' + euro(x.amount) + ')').join(', ')}. Corrigez les dates avant d’utiliser la prévision ; ils ne sont pas placés arbitrairement dans un mois.` : 'Toutes les échéances non soldées sont planifiées.';
    $('#financeBfrDetail').innerHTML = `<p>Créances des événements réalisés : <strong>${euro(s.bfrReceivables)}</strong> + acomptes fournisseurs payés : <strong>${euro(s.supplierAdvances)}</strong> − dettes fournisseurs courantes : <strong>${euro(s.bfrPayables)}</strong> − acomptes clients reçus avant événement : <strong>${euro(s.clientAdvances)}</strong> = <strong>${euro(s.bfr)}</strong>.</p><p>Estimation selon la date des événements ou leur statut Terminé. Hors stocks, créances et dettes fiscales/sociales, factures non enregistrées et ajustements comptables. Un événement sans date est considéré à venir. Le BFR comptable complet est à valider avec l’expert-comptable.</p>`;
    $('#financePersonal').textContent = s.personal.map(x => `À rembourser à ${x.name} : ${euro(x.amount)}`).join(' · ');
    $('#financeBalanceLabel').textContent = data.settings.balance_date ? `Solde vérifié au ${dateFr(data.settings.balance_date)} : ${euro(data.settings.balance_amount)}. Les paiements de cette journée et antérieurs sont inclus dans ce solde.` : 'Renseignez le solde de fin de journée de votre relevé bancaire pour démarrer.';
    $('#financeFlowsBody').innerHTML = data.flows.filter(f => !f.cancelled).sort((a, b) => b.flow_date.localeCompare(a.flow_date)).map(f => `<tr><td>${dateFr(f.flow_date)}</td><td>${esc(f.label)}</td><td>${euro(f.amount)}</td><td>${f.realized ? 'Réalisé' : 'Prévu'}</td><td>${!f.realized ? button('Marquer réalisé', 'realize-flow', f.id) : ''} ${button('Annuler', 'cancel-flow', f.id)} ${button('Pièces', 'files-flow', f.id)}</td></tr>`).join('') || '<tr><td colspan="5"><div class="empty-state">Ajoutez ici uniquement les autres mouvements : capital, prêt, TVA, remboursement d’associé… Les paiements clients/fournisseurs sont déjà comptés.</div></td></tr>';
    $('#financeLegacy').hidden = !invoices.some(d => Number(d.finance_initial_paid) > 0);
    $('#financeVatWarning').textContent = s.pendingVat ? `${s.pendingVat} dépense(s) avec TVA récupérable à confirmer : les coûts incluent cette TVA par prudence.` : 'La marge est calculée sur les dépenses courantes saisies, avant frais généraux non rattachés, rémunération, amortissements et impôts.';
  }
  function showTab(tab) { $$('#financeTabs button').forEach(b => { b.classList.toggle('active', b.dataset.financeTab === tab); b.setAttribute('aria-selected', b.dataset.financeTab === tab); }); $$('.finance-view').forEach(v => v.hidden = v.id !== 'finance-' + tab); }
  function form(title, mode, fields, footer = '') {
    editing = mode; pendingId = crypto.randomUUID();
    $('#financeModalTitle').textContent = title;
    $('#financeForm').innerHTML = fields + `<div class="field full finance-form-note">${footer}</div>`;
    $('#financeForm').querySelectorAll('.field').forEach((wrap, i) => { const input = wrap.querySelector('input,select,textarea'), label = wrap.querySelector('label'); if (input && label) { input.id = 'finance-field-' + i; label.htmlFor = input.id; } });
    $('#financeSaveBtn').hidden = false; $('#financeSaveBtn').disabled = false; $('#financeFormError').textContent = ''; openModal('financeModal');
  }
  function targets() { return [['', 'Frais généraux FASTE'], ...state.events.map(e => ['event:' + e.id, e.title]), ...state.documents.filter(d => d.type === 'facture' && !state.events.some(e => e.source_quote_id === d.source_quote_id && d.source_quote_id)).map(d => ['document:' + d.id, d.number + ' · ' + (d.contact?.name || '')])]; }
  function uploadField() { return '<div class="field full"><label>Photo ou PDF du justificatif (facultatif)</label><input name="files" type="file" accept="application/pdf,image/jpeg,image/png,image/webp,image/heic,image/heif" multiple><small>10 Mo par fichier. Photo lisible, complète, sans couper le montant ni la date.</small></div>'; }
  function recurring(id) {
    const r = data.recurring.find(x => x.id === id) || {};
    form(id ? 'Modifier la dépense récurrente' : 'Dépense mensuelle automatique', { type: 'recurring', id }, [field('Fournisseur', 'supplier', r.supplier, { required: true }), field('Libellé', 'label', r.label, { required: true }), field('Catégorie', 'category', r.category || 'Autre', { choices: categoryChoices }), field('Montant HT mensuel (€)', 'amount_ht', r.amount_ht ?? '', { type: 'number', min: 0, step: '0.01', required: true }), field('Taux de TVA (%)', 'vat_rate', r.amount_ht ? Math.round(r.amount_vat / r.amount_ht * 10000) / 100 : 20, { type: 'number', min: 0, max: 100, step: '0.01', required: true }), field('TVA mensuelle exacte (€)', 'amount_vat', r.amount_vat ?? 0, { type: 'number', min: 0, step: '0.01', required: true }), field('Première date', 'start_date', r.start_date || localDate(), { type: 'date', required: true }), field('Jour du mois', 'day_of_month', r.day_of_month || Number(localDate().slice(-2)), { type: 'number', min: 1, max: 31, required: true }), field('Fin (facultatif)', 'end_date', r.end_date, { type: 'date' }), field('Note', 'notes', r.notes, { rows: 2, full: true })].join(''), 'Chaque mois une ligne À vérifier est créée, sans paiement ni justificatif inventé. Les montants modifiés ici concernent les prochains mois ; ouvrez la dépense pour modifier le mois déjà créé. Les jours 29 à 31 sont ramenés au dernier jour du mois si nécessaire. La TVA réelle peut être de 0 € pour une assurance.');
    const f = $('#financeForm'), calc = () => { f.elements.namedItem('amount_vat').value = F.money(F.cents(Number(f.elements.namedItem('amount_ht').value) * Number(f.elements.namedItem('vat_rate').value) / 100)).toFixed(2); };
    f.elements.namedItem('amount_ht').addEventListener('input', calc); f.elements.namedItem('vat_rate').addEventListener('input', calc);
  }
  function credit(id) {
    const d = state.documents.find(x => x.id === id);
    form('Avoir sur ' + d.number, { type: 'credit', id }, [field('Date de l’avoir', 'document_date', localDate(), { type: 'date', required: true }), field('Motif', 'reason', '', { required: true, full: true }), field('Réduction HT (€)', 'amount_ht', '', { type: 'number', min: '0.01', step: '0.01', required: true }), field('TVA de la réduction (€)', 'amount_vat', '', { type: 'number', min: 0, step: '0.01', required: true })].join(''), 'Imputation sur le montant non encaissé uniquement. L’avoir diminue le restant et les recettes HT, sans mouvement bancaire. Pour une facture déjà payée et un remboursement, faites valider le traitement avec l’expert-comptable.');
    const f = $('#financeForm'); f.elements.namedItem('amount_ht').addEventListener('input', () => { f.elements.namedItem('amount_vat').value = F.money(Math.round(Number(f.elements.namedItem('amount_ht').value) * 20)).toFixed(2); });
  }
  function expense(id = null, preset = '') {
    const e = data.expenses.find(x => x.id === id) || {};
    const target = e.event_id ? 'event:' + e.event_id : e.document_id ? 'document:' + e.document_id : preset.startsWith('document:') ? preset : preset ? 'event:' + preset : '';
    form(id ? 'Modifier la dépense' : 'Ajouter une dépense', { type: 'expense', id }, [field('Fournisseur', 'supplier', e.supplier, { required: true }), field('Numéro facture / référence du ticket', 'reference', e.reference, { required: true }), field('Pour quel événement ?', 'target', target, { choices: targets(), full: true }), field('Date de la facture', 'document_date', e.document_date || localDate(), { type: 'date', required: true }), field('À payer le', 'due_date', e.due_date || localDate(), { type: 'date', required: true }), field('Montant HT (€)', 'amount_ht', e.amount_ht ?? '', { type: 'number', min: 0, step: '0.01', required: true }), field('Taux de TVA (%)', 'vat_rate', e.amount_ht ? F.money(e.amount_vat / e.amount_ht * 10000) : 20, { type: 'number', min: 0, step: '0.01', required: true }), field('TVA exacte de la pièce (€)', 'amount_vat', e.amount_vat ?? '', { type: 'number', min: 0, step: '0.01', required: true }), '<div class="field"><label>Total TTC</label><strong id="financeExpenseTotal">—</strong></div>', field('Catégorie', 'category', e.category || 'Autre', { choices: categoryChoices }), field('Nature', 'kind', e.kind || 'charge', { choices: [['charge', 'Dépense courante'], ['investment', 'Investissement : matériel / véhicule'], ['advance', 'Acompte fournisseur avant facture finale']] }), field('TVA récupérable vérifiée ?', 'deduction_status', e.deduction_status || 'unknown', { choices: [['unknown', 'À confirmer'], ['yes', 'Oui'], ['no', 'Non']] }), field('TVA récupérable (€)', 'deductible_vat', e.deductible_vat || 0, { type: 'number', min: 0, step: '0.01', required: true }), field('Note', 'notes', e.notes, { rows: 2, full: true }), uploadField(), '<div class="field full"><button type="button" class="btn ghost" id="financeReadReceipt">Lire le justificatif sélectionné</button><small>Lecture sur votre appareil. Vérifiez la proposition avant de l’appliquer.</small><div id="financeReceiptProposal" role="status"></div></div>', id ? `<div class="field full">${button('Archiver la dépense', 'archive-expense', id)} ${button('Voir les justificatifs', 'files-expense', id)}</div>` : ''].join(''), 'Un acompte fournisseur est saisi une seule fois : à réception de la facture finale, ouvrez cette ligne, passez en Dépense courante et remplacez les montants par le total de la facture. Les paiements déjà enregistrés restent déduits. Un investissement est suivi en trésorerie, sans être déduit de la marge.');
    const formEl = $('#financeForm'); const update = () => { const ht = Number(formEl.elements.namedItem('amount_ht').value || 0), vat = Number(formEl.elements.namedItem('amount_vat').value || 0); $('#financeExpenseTotal').textContent = euro(ht + vat); formEl.elements.namedItem('deductible_vat').disabled = formEl.elements.namedItem('deduction_status').value !== 'yes'; };
    const calc = () => { formEl.elements.namedItem('amount_vat').value = F.money(F.cents(Number(formEl.elements.namedItem('amount_ht').value || 0) * Number(formEl.elements.namedItem('vat_rate').value || 0) / 100)); update(); };
    formEl.elements.namedItem('amount_ht').addEventListener('input', calc); formEl.elements.namedItem('vat_rate').addEventListener('input', calc); formEl.elements.namedItem('amount_vat').addEventListener('input', update);
    formEl.elements.namedItem('deduction_status').addEventListener('change', () => { formEl.elements.namedItem('deductible_vat').value = formEl.elements.namedItem('deduction_status').value === 'yes' ? formEl.elements.namedItem('amount_vat').value : 0; update(); }); update();
    if (e.provisional) $('#financeForm').insertAdjacentHTML('beforeend', '<div class="field full"><label><input type="checkbox" id="financeExpenseVerified"> Montants vérifiés sur le justificatif du mois</label></div>');
    $('#financeReadReceipt').addEventListener('click', readReceipt);
  }
  async function readReceipt() {
    const file = $('#financeForm [name="files"]').files[0], box = $('#financeReceiptProposal'), readBtn = $('#financeReadReceipt');
    if (!file) { box.textContent = 'Sélectionnez une photo ou un PDF avant la lecture.'; return; }
    const currentForm = $('#financeForm'), sessionId = pendingId; readBtn.disabled = true; $('#financeSaveBtn').disabled = true;
    try {
      const r = await FasteReceipt.read(file, message => { if (pendingId === sessionId) box.textContent = message; });
      if (pendingId !== sessionId) return;
      box.innerHTML = `<p><strong>Proposition à vérifier</strong><br>Fournisseur : ${esc(r.supplier || 'Non détecté')} · Référence : ${esc(r.reference || 'Non détectée')}<br>Date : ${dateFr(r.document_date)} · HT : ${r.ht == null ? 'Non détecté' : euro(r.ht)} · TVA : ${r.vat == null ? 'Non détectée' : euro(r.vat)} · TTC : ${r.ttc == null ? 'Non détecté' : euro(r.ttc)}</p><p>${r.coherent === false ? 'Les montants HT + TVA ne correspondent pas au TTC. Corrigez la saisie manuellement.' : 'Comparez ces valeurs à la pièce originale. Aucun paiement ni droit à déduction ne sera déduit du justificatif.'}</p><label><input type="checkbox" id="financeReceiptConfirmed"> J’ai vérifié ces valeurs sur le justificatif.</label><button type="button" class="btn ghost" id="financeApplyReceipt" disabled>Appliquer la proposition</button>`;
      $('#financeReceiptConfirmed').addEventListener('change', e => $('#financeApplyReceipt').disabled = !e.target.checked || r.coherent === false);
      $('#financeApplyReceipt').addEventListener('click', () => {
        for (const [key, value] of Object.entries({ supplier: r.supplier, reference: r.reference, document_date: r.document_date, amount_ht: r.ht, amount_vat: r.vat })) if (value != null) currentForm.elements.namedItem(key).value = value;
        if (r.ht > 0 && r.vat != null) currentForm.elements.namedItem('vat_rate').value = Math.round(r.vat / r.ht * 10000) / 100;
        currentForm.elements.namedItem('amount_vat').dispatchEvent(new Event('input')); box.textContent = 'Proposition appliquée. Vérifiez l’échéance et l’événement, puis cliquez sur Enregistrer.';
      });
    } catch (e) { if (pendingId === sessionId) box.textContent = 'Lecture impossible : ' + e.message + '. La saisie manuelle reste disponible.'; } finally { if (pendingId === sessionId) { readBtn.disabled = false; $('#financeSaveBtn').disabled = false; } }
  }
  function payment(id, receipt) {
    const doc = receipt ? state.documents.find(d => d.id === id) : data.expenses.find(e => e.id === id);
    if (!doc) return toast('Facture / dépense introuvable. Actualisez.', true);
    if ($('#documentModal').classList.contains('open')) closeModal('documentModal');
    const due = receipt ? F.remainingDoc(doc, data.payments, localDate(), data.credits) : F.expenseTtc(doc) - F.paidExpense(doc, data.payments, localDate());
    form(receipt ? 'Encaissement client / acompte reçu' : 'Paiement de la dépense', { type: 'payment', id, receipt }, [field('Montant reçu / payé TTC (€)', 'amount', F.money(F.cents(due)), { type: 'number', min: '0.01', step: '0.01', required: true }), field('Date réelle du paiement', 'payment_date', localDate(), { type: 'date', required: true }), field('Payé par', 'payer', 'bank', { choices: receipt ? [['bank', 'Compte FASTE']] : [['bank', 'Compte FASTE'], ['Paul', 'Paul personnellement'], ['Maxime', 'Maxime personnellement']] }), field('Référence du virement / paiement', 'reference', '', { required: true }), uploadField()].join(''), `${esc(receipt ? doc.number : doc.supplier)} · Reste : ${euro(due)}. Saisissez seulement le paiement reçu ou effectué, même partiel. Il ne crée pas une nouvelle facture ni une nouvelle dépense.`);
    $('#financeForm [name="payment_date"]').max = localDate();
  }
  function balance() { form('Mon solde bancaire de référence', { type: 'balance' }, field('Date du solde de fin de journée', 'balance_date', data.settings.balance_date || localDate(), { type: 'date', required: true }) + field('Solde réel sur le relevé (€)', 'balance_amount', data.settings.balance_amount ?? '', { type: 'number', step: '0.01', required: true }), 'Après cette date, enregistrez tous les mouvements pour que le solde calculé reste exact. Mettre à jour ce solde permet de repartir d’un relevé vérifié sans supprimer l’historique.'); $('#financeForm [name="balance_date"]').max = localDate(); }
  function flow() { form('Autre entrée ou sortie d’argent', { type: 'flow' }, [field('Libellé', 'label', '', { required: true, full: true }), field('Date', 'flow_date', localDate(), { type: 'date', required: true }), field('Montant signé (€)', 'amount', '', { type: 'number', step: '0.01', required: true }), field('Nature', 'category', 'other', { choices: [['other', 'Autre mouvement'], ['capital', 'Capital / apport'], ['loan', 'Prêt / remboursement de prêt'], ['tax', 'TVA / impôts / cotisations'], ['reimbursement', 'Remboursement de frais avancés']] }), field('Associé remboursé', 'beneficiary', '', { choices: [['', 'Sans objet'], ['Paul', 'Paul'], ['Maxime', 'Maxime']] }), field('État', 'realized', 'false', { choices: [['false', 'Prévu'], ['true', 'Réalisé sur le compte']] }), uploadField()].join(''), 'Entrée positive, sortie négative. N’ajoutez pas ici un paiement client ou fournisseur déjà enregistré dans le module.'); }
  async function attach(files, target) {
    for (const file of files) {
      if (file.size > 10485760 || !file.size || !['application/pdf', 'image/jpeg', 'image/png', 'image/webp', 'image/heic', 'image/heif'].includes(file.type)) throw new Error('Format autorisé : PDF, JPEG, PNG, WebP, HEIC ; 10 Mo maximum par pièce.');
      const filename = file.name.replace(/[\/\\\x00-\x1f]/g, '_'); const path = crypto.randomUUID() + '/' + filename;
      const upload = await db.storage.from('faste-finance').upload(path, file, { contentType: file.type, upsert: false }); if (upload.error) throw upload.error;
      const r = await db.from('finance_attachments').insert({ ...target, path, filename, size: file.size, mime_type: file.type });
      if (r.error) { await db.storage.from('faste-finance').remove([path]); throw r.error; }
    }
  }
  async function save(event) {
    event.preventDefault(); if (busy || !ready) return;
    busy = true; $('#financeSaveBtn').disabled = true; $('#financeFormError').textContent = '';
    const values = Object.fromEntries(new FormData(event.currentTarget)); const files = [...($('#financeForm [name="files"]')?.files || [])];
    let target, saved = false;
    try {
      const v = values;
      let result;
      if (editing.type === 'expense') {
        const payload = { supplier: v.supplier.trim(), reference: v.reference.trim(), event_id: v.target.startsWith('event:') ? v.target.slice(6) : null, document_id: v.target.startsWith('document:') ? v.target.slice(9) : null, document_date: v.document_date, due_date: v.due_date, category: v.category, kind: v.kind, amount_ht: Number(v.amount_ht), amount_vat: Number(v.amount_vat), deduction_status: v.deduction_status, deductible_vat: v.deduction_status === 'yes' ? Number(v.deductible_vat) : 0, notes: v.notes || null };
        if (Number(v.vat_rate) > 100) throw new Error('Le taux doit être compris entre 0 et 100 %.');
        const id = editing.id || pendingId; result = editing.id ? await db.from('finance_expenses').update(payload).eq('id', id).select('id').single() : await db.from('finance_expenses').insert({ ...payload, id }).select('id').single(); target = { expense_id: id };
        if (editing.id && data.expenses.find(e => e.id === editing.id)?.provisional) {
          const checked = $('#financeExpenseVerified')?.checked; if (checked) { const r = await db.from('finance_expenses').update({ provisional: false }).eq('id', id); if (r.error) throw r.error; }
        }
      } else if (editing.type === 'recurring') {
        const payload = { supplier: v.supplier.trim(), label: v.label.trim(), category: v.category, amount_ht: Number(v.amount_ht), amount_vat: Number(v.amount_vat), start_date: v.start_date, end_date: v.end_date || null, day_of_month: Number(v.day_of_month), notes: v.notes || null };
        result = editing.id ? await db.from('finance_recurring').update(payload).eq('id', editing.id).select('id').single() : await db.from('finance_recurring').insert({ ...payload, id: pendingId }).select('id').single();
      } else if (editing.type === 'credit') {
        result = await db.from('finance_credits').insert({ id: pendingId, document_id: editing.id, document_date: v.document_date, reason: v.reason.trim(), amount_ht: Number(v.amount_ht), amount_vat: Number(v.amount_vat) }).select('id').single();
      } else if (editing.type === 'payment') {
        target = editing.receipt ? { document_id: editing.id } : { expense_id: editing.id };
        result = await db.from('finance_payments').insert({ id: pendingId, ...target, amount: Number(v.amount), payment_date: v.payment_date, payer: v.payer, reference: v.reference.trim() }).select('id').single(); target = { payment_id: pendingId };
      } else if (editing.type === 'balance') {
        result = await db.from('finance_settings').upsert({ id: 1, balance_date: v.balance_date, balance_amount: Number(v.balance_amount), updated_at: new Date().toISOString() }).select('id').single();
      } else if (editing.type === 'flow') {
        result = await db.from('finance_flows').insert({ id: pendingId, label: v.label.trim(), flow_date: v.flow_date, amount: Number(v.amount), category: v.category, beneficiary: v.beneficiary || null, realized: v.realized === 'true' }).select('id').single(); target = { flow_id: pendingId };
      } else if (editing.type === 'files') { target = editing.target; result = {}; }
      if (result.error) throw result.error;
      saved = true;
      if (files.length && target) await attach(files, target);
      closeModal('financeModal'); toast('Enregistré et partagé avec votre associé.'); await loadData({ quiet: true });
    } catch (e) {
      if (saved && target) {
        editing = { type: 'files', target }; $('#financeForm').innerHTML = uploadField(); $('#financeModalTitle').textContent = 'Ajouter les justificatifs';
        $('#financeFormError').textContent = `La saisie est enregistrée. Justificatif incomplet : ${e.message}. Sélectionnez uniquement les pièces manquantes puis réessayez.`; await loadData({ quiet: true });
      } else $('#financeFormError').textContent = e.message;
    } finally { busy = false; $('#financeSaveBtn').disabled = false; render(); }
  }
  async function files(target) {
    form('Justificatifs', { type: 'files', target }, uploadField(), 'Ces fichiers restent privés dans votre espace FASTE.');
    const list = data.attachments.filter(a => Object.entries(target).every(([k, v]) => a[k] === v));
    const box = document.createElement('div'); box.className = 'field full finance-file-list';
    for (const a of list) {
      const b = document.createElement('button'); b.type = 'button'; b.className = 'btn ghost'; b.textContent = a.filename;
      b.addEventListener('click', async () => { const r = await db.storage.from('faste-finance').createSignedUrl(a.path, 300); if (r.error) return toast(r.error.message, true); const link = document.createElement('a'); link.href = r.data.signedUrl; link.target = '_blank'; link.rel = 'noopener'; link.click(); }); box.appendChild(b);
    }
    if (!list.length) box.textContent = 'Aucun justificatif ajouté pour le moment.'; $('#financeForm').prepend(box);
  }
  async function change(table, id, patch) { if (busy) return; busy = true; try { const r = await db.from(table).update(patch).eq('id', id).select('id').single(); if (r.error) throw r.error; await loadData({ quiet: true }); } catch (e) { toast(e.message, true); } finally { busy = false; render(); } }
  async function actions(event) {
    const b = event.target.closest('[data-finance-action]'); if (!b || !ready || busy) return; const id = b.dataset.id;
    switch (b.dataset.financeAction) {
      case 'expense': expense(null, id); break; case 'edit-expense': expense(id); break;
      case 'receipt': payment(id, true); break; case 'payment': payment(id, false); break;
      case 'balance': balance(); break; case 'flow': flow(); break;
      case 'recurring': recurring(); break; case 'edit-recurring': recurring(id); break;
      case 'pause-recurring': await change('finance_recurring', id, { active: false }); break;
      case 'resume-recurring': await change('finance_recurring', id, { active: true }); break;
      case 'credit': credit(id); break;
      case 'cancel-credit': if (confirm('Annuler cet avoir saisi par erreur ? Il restera dans l’historique.')) await change('finance_credits', id, { cancelled: true }); break;
      case 'files-expense': await files({ expense_id: id }); break; case 'files-document': await files({ document_id: id }); break;
      case 'files-payment': await files({ payment_id: id }); break; case 'files-flow': await files({ flow_id: id }); break;
      case 'cancel-payment': if (confirm('Annuler ce paiement saisi par erreur ? Il restera dans l’historique. Cette action ne réalise aucun remboursement bancaire.')) await change('finance_payments', id, { cancelled: true }); break;
      case 'archive-expense': if (confirm('Archiver cette dépense ? Les pièces et l’historique seront conservés. Les paiements doivent être annulés auparavant.')) { await change('finance_expenses', id, { archived: true }); if (!busy) closeModal('financeModal'); } break;
      case 'cancel-flow': if (confirm('Annuler ce mouvement dans le suivi ? Cette action ne modifie pas votre compte bancaire.')) await change('finance_flows', id, { cancelled: true }); break;
      case 'realize-flow': await change('finance_flows', id, { realized: true }); break;
    }
  }
  function exportTables(from, to) {
    const within = date => date && date >= from && date <= to;
    const docs = state.documents.filter(d => d.type === 'facture' && within(d.document_date));
    const expenses = data.expenses.filter(e => within(e.document_date));
    const payments = data.payments.filter(p => within(p.payment_date));
    const flows = data.flows.filter(f => within(f.flow_date));
    const credits = data.credits.filter(c => within(c.document_date));
    const docIds = new Set([...docs.map(d => d.id), ...payments.map(p => p.document_id).filter(Boolean), ...credits.map(c => c.document_id)]), expIds = new Set([...expenses.map(e => e.id), ...payments.map(p => p.expense_id).filter(Boolean)]);
    const linkedDocs = state.documents.filter(d => docIds.has(d.id)); const linkedExpenses = data.expenses.filter(e => expIds.has(e.id));
    const attachments = data.attachments.filter(a => docIds.has(a.document_id) || expIds.has(a.expense_id) || payments.some(p => p.id === a.payment_id) || flows.some(f => f.id === a.flow_id));
    const tables = {
      Factures: [['ID', 'Numéro', 'Client', 'Devis lié', 'Événement', 'Date facture', 'Échéance', 'HT', 'TVA', 'TTC', 'Encaissé à fin période', 'Restant à fin période', 'Encaissement historique sans date'], ...docs.map(d => [d.id, d.number, d.contact?.name, d.source_quote_id, d.event_type, d.document_date, d.due_date, Number(d.total_ht), Number(d.total_vat), Number(d.total_ttc), F.docPaid(d, data.payments, to), F.remainingDoc(d, data.payments, to, data.credits), Number(d.finance_initial_paid || 0)])],
      Depenses: [['ID', 'Fournisseur', 'Référence', 'Événement ID', 'Facture dossier ID', 'Date', 'Échéance', 'Catégorie', 'Nature', 'HT', 'TVA', 'TTC', 'Déduction vérifiée', 'TVA déductible', 'Payé à fin période', 'Archivée'], ...expenses.map(e => [e.id, e.supplier, e.reference, e.event_id, e.document_id, e.document_date, e.due_date, e.category, e.kind, Number(e.amount_ht), Number(e.amount_vat), F.expenseTtc(e), e.deduction_status, Number(e.deductible_vat), F.paidExpense(e, data.payments, to), e.archived ? 'Oui' : 'Non'])],
      Paiements: [['ID', 'Facture ID', 'Dépense ID', 'Date réelle', 'Montant TTC', 'Payeur', 'Référence', 'Annulé'], ...payments.map(p => [p.id, p.document_id, p.expense_id, p.payment_date, Number(p.amount), p.payer, p.reference, p.cancelled ? 'Oui' : 'Non'])],
      Autres_mouvements: [['ID', 'Libellé', 'Date', 'Montant signé', 'Nature', 'Associé', 'Réalisé', 'Annulé'], ...flows.map(f => [f.id, f.label, f.flow_date, Number(f.amount), f.category, f.beneficiary, f.realized ? 'Oui' : 'Non', f.cancelled ? 'Oui' : 'Non'])],
      Justificatifs: [['ID', 'Facture ID', 'Dépense ID', 'Paiement ID', 'Mouvement ID', 'Fichier dans archive', 'Type', 'Taille'], ...attachments.map(a => [a.id, a.document_id, a.expense_id, a.payment_id, a.flow_id, 'justificatifs/' + a.id + '-' + a.filename, a.mime_type, a.size])],
      Dossiers_lies: [['ID', 'Type', 'Référence', 'Date', 'HT', 'TVA', 'TTC'], ...linkedDocs.filter(d => !within(d.document_date)).map(d => [d.id, 'Facture hors période liée à paiement', d.number, d.document_date, Number(d.total_ht), Number(d.total_vat), Number(d.total_ttc)]), ...linkedExpenses.filter(e => !within(e.document_date)).map(e => [e.id, 'Dépense hors période liée à paiement', e.reference, e.document_date, Number(e.amount_ht), Number(e.amount_vat), F.expenseTtc(e)])],
      Lignes_factures: [['Facture ID', 'Description', 'Quantité', 'Prix HT', 'Taux TVA', 'HT ligne', 'TVA ligne', 'TTC ligne'], ...state.lines.filter(l => docIds.has(l.document_id)).map(l => [l.document_id, l.description, Number(l.quantity), Number(l.unit_price_ht), Number(l.vat_rate), Number(l.line_total_ht), Number(l.line_total_vat), Number(l.line_total_ttc)])],
      Marges_evenements: [['Événement', 'Client', 'Facturé HT cumulé à fin période', 'Coûts directs cumulés', 'Marge cumulée €', 'Marge cumulée %', 'TVA à vérifier'], ...F.eventRows(model(), to).map(r => [r.title, r.quote?.contact?.name || r.docs[0]?.contact?.name, r.billed, r.costs, r.margin, r.rate, r.pendingVat ? 'Oui' : 'Non'])],
      Soldes_fin_periode: [['Indicateur', 'Valeur'], ['Date de situation', to], ['Solde bancaire de référence : date', data.settings.balance_date], ['Solde bancaire de référence : montant', data.settings.balance_amount], ['BFR opérationnel estimé, hors fiscalité et stocks', F.snapshot(model(), to).bfr], ['Trésorerie calculée', F.snapshot(model(), to).cash]],
      Guide_export: [['Information'], ['Export de gestion ; pas un FEC ni une déclaration de TVA.'], ['Factures et dépenses sélectionnées par date de document ; paiements par date réelle. Les dossiers hors période liés à un paiement sont ajoutés sans les compter comme facturation de la période.'], ['Annulations conservées. Prévisions de mouvements distinguées du réalisé. Déduction TVA unknown = à confirmer, yes = vérifiée, no = non récupérable.'], ['Les encaissements historiques sans date sont conservés séparément ; vérifier leur période avec les relevés.'], ['Acompte fournisseur : ouvrir la dépense initiale à la facture finale, changer sa nature et saisir le total final sans recréer ses paiements.'], ['Les PDF clients inclus sont générés depuis la version actuelle des documents FASTE ; les pièces originales téléversées sont dans justificatifs.'], ['Chiffres de BFR opérationnel estimés selon dates et statuts événements, hors fiscalité, stocks et ajustements.']]
    };
    tables.Avoirs = [['ID', 'Numéro', 'Facture ID', 'Date', 'Motif', 'HT réduction', 'TVA réduction', 'TTC réduction', 'Annulé'], ...credits.map(c => [c.id, c.number, c.document_id, c.document_date, c.reason, Number(c.amount_ht), Number(c.amount_vat), F.expenseTtc(c), c.cancelled ? 'Oui' : 'Non'])];
    tables.Devis_en_attente = [['ID', 'Numéro', 'Client', 'Date', 'HT', 'TTC', 'État'], ...state.documents.filter(d => d.type === 'devis' && d.status === 'accepted' && !state.documents.some(i => i.type === 'facture' && i.source_quote_id === d.id)).map(d => [d.id, d.number, d.contact?.name, d.document_date, Number(d.total_ht), Number(d.total_ttc), 'Accepté, à facturer'])];
    tables.Recurrences = [['ID', 'Fournisseur', 'Libellé', 'HT mensuel', 'TVA mensuelle', 'Jour', 'Début', 'Fin', 'Active'], ...data.recurring.map(r => [r.id, r.supplier, r.label, Number(r.amount_ht), Number(r.amount_vat), r.day_of_month, r.start_date, r.end_date, r.active ? 'Oui' : 'Non'])];
    tables.Guide_export.push(['Les avoirs sont des réductions positives à soustraire des factures ; ils ne sont pas des paiements. Les lignes récurrentes À vérifier sont des estimations, à valider avant comptabilisation. Les modèles Recurrences et devis en attente ne sont pas des dépenses/factures émises.']);
    tables.Depenses[0].push('À vérifier', 'Récurrence ID'); expenses.forEach((e, i) => tables.Depenses[i + 1].push(e.provisional ? 'Oui' : 'Non', e.recurring_id));
    return { tables, attachments, docs: linkedDocs, credits };
  }
  async function exportPackage(event) {
    event.preventDefault(); if (busy || !ready) return; const v = Object.fromEntries(new FormData(event.currentTarget));
    if (v.from > v.to) return toast('La fin de période doit suivre le début.', true);
    busy = true; const btn = $('#financeExportBtn'); btn.disabled = true; $('#financeExportStatus').textContent = 'Préparation des données…';
    try {
      const fresh = await loadData({ quiet: true }); if (!fresh || !ready) throw new Error(errorMessage || 'Actualisation des données impossible');
      const { attachments, docs, credits } = exportTables(v.from, v.to);
      const rows = FasteExport.journal({ ...model(), contacts: state.contacts, lines: state.lines }, v.from, v.to);
      if (attachments.reduce((s, a) => s + a.size, 0) > 209715200) throw new Error('Les pièces dépassent 200 Mo. Exportez une période plus courte.');
      const zip = new JSZip(), workbook = new ExcelJS.Workbook(); workbook.creator = 'FASTE';
      zip.file('FASTE_journal_comptable.csv', F.csv(rows));
      const sheet = workbook.addWorksheet('Journal comptable');
      sheet.addTable({ name: 'JournalFASTE', ref: 'A1', headerRow: true, totalsRow: false, style: { theme: 'TableStyleMedium2', showRowStripes: true }, columns: rows[0].map(name => ({ name, filterButton: true })), rows: rows.slice(1).map(row => row.map(x => x ?? '')) });
      sheet.views = [{ state: 'frozen', ySplit: 1, xSplit: 3 }];
      const widths = [13,28,29,30,38,29,55,13,16,16,16,19,19,23,22,32,22,25,60,65,23,18,38]; sheet.columns.forEach((c,i) => c.width=widths[i] || 24);
      sheet.eachRow((row,i) => { row.alignment={vertical:'top',wrapText:true}; row.eachCell({includeEmpty:true},cell => cell.border={top:{style:'thin',color:{argb:'FF000000'}},left:{style:'thin',color:{argb:'FF000000'}},bottom:{style:'thin',color:{argb:'FF000000'}},right:{style:'thin',color:{argb:'FF000000'}}}); row.height=i===1 ? 34 : Math.min(110,Math.max(32,...row.values.filter(x => typeof x==='string').map(x => x.split('\n').length*15))); });
      sheet.getRow(1).font = { bold: true, color: { argb: 'FFFFFFFF' } }; sheet.getRow(1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF142940' } };
      [9,10,11,12,13,14,17,18,21].forEach(i => sheet.getColumn(i).numFmt='#,##0.00 "€"'); sheet.getColumn(22).numFmt='0.00 " %"';
      zip.file('LIRE_AVANT_COMPTABILISATION.txt', 'Un seul tableau : FASTE_export_comptable.xlsx, feuille Journal comptable. Le CSV contient le même tableau.\nFiltrer Type pour distinguer factures, avoirs, dépenses et règlements. Les paiements ont leurs montants dans les colonnes Entrée/Sortie banque et ne répètent pas le HT/TVA/TTC des pièces. Les avoirs sont négatifs. Les frais personnels sont séparés de la banque. Les prévisions, pièces hors période et synthèses ne sont pas à additionner aux opérations. La colonne Justificatifs / PDF donne le chemin du fichier joint dans cette archive. Les PDF clients sont générés depuis la version actuelle ; les justificatifs originaux sont conservés. Les dépenses À vérifier doivent être confirmées sur une pièce. Cet export de gestion n’est pas un FEC. Les lignes TEST sont fictives et ne doivent pas être comptabilisées.');
      zip.file('FASTE_export_comptable.xlsx', await workbook.xlsx.writeBuffer());
      for (let i = 0; i < attachments.length; i++) { const a = attachments[i]; $('#financeExportStatus').textContent = `Justificatifs : ${i + 1}/${attachments.length}…`; const r = await db.storage.from('faste-finance').download(a.path); if (r.error) throw new Error(`Pièce ${a.filename} inaccessible : ${r.error.message}. L’export n’a pas été livré incomplet.`); zip.file('justificatifs/' + a.id + '-' + a.filename, await r.data.arrayBuffer()); }
      for (const doc of docs) zip.file('factures_clients/' + doc.id + '-' + doc.number.replace(/[^a-zA-Z0-9_-]/g, '_') + '.pdf', generatePdf(doc, { download: false }));
      for (const c of credits) {
        const pdf = new window.jspdf.jsPDF(), d = state.documents.find(d => d.id === c.document_id), company = state.settings || {};
        let y=18; const lines = [company.company_name || 'FASTE', [company.legal_form, company.siren, company.vat_number].filter(Boolean).join(' · '), [company.address, company.postal_code, company.city].filter(Boolean).join(' '), '', 'AVOIR ' + c.number + (c.cancelled ? ' — ANNULÉ' : ''), 'Date : ' + dateFr(c.document_date), 'Facture concernée : ' + (d?.number || c.document_id) + ' du ' + dateFr(d?.document_date), 'Client : ' + (d?.contact?.name || ''), '', 'Motif : ' + c.reason, '', 'Réduction HT : ' + euro(c.amount_ht), 'Réduction TVA : ' + euro(c.amount_vat), 'Réduction TTC : ' + euro(F.expenseTtc(c)), '', 'Cet avoir est imputé sur le montant non encaissé. Aucun remboursement bancaire.', c.number.startsWith('TEST-') ? 'EXEMPLE FICTIF — NE PAS COMPTABILISER, NE PAS ENVOYER.' : ''];
        pdf.setFontSize(11); for (const line of lines) for (const row of pdf.splitTextToSize(line || ' ', 180)) { if(y>275) { pdf.addPage(); y=18; } pdf.text(row,15,y); y+=6; }
        zip.file('avoirs_clients/' + c.id + '-' + c.number.replace(/[^a-zA-Z0-9_-]/g, '_') + '.pdf',pdf.output('arraybuffer'));
      }
      const blob = await zip.generateAsync({ type: 'blob' }); const url = URL.createObjectURL(blob), a = document.createElement('a'); a.href = url; a.download = `FASTE_comptable_${v.from}_${v.to}.zip`; a.click(); setTimeout(() => URL.revokeObjectURL(url), 60000);
      $('#financeExportStatus').textContent = `Export téléchargé : un seul tableau Excel (${rows.length-1} lignes), son CSV, ${docs.length} PDF clients, ${credits.length} avoir(s) et ${attachments.length} justificatif(s).`;
    } catch (e) { $('#financeExportStatus').textContent = 'Export impossible : ' + e.message; } finally { busy = false; btn.disabled = false; render(); }
  }
  function bind() {
    document.addEventListener('click', actions); $('#financeForm').addEventListener('submit', save);
    $('#financeTabs').addEventListener('click', e => { const b = e.target.closest('[data-finance-tab]'); if (b) showTab(b.dataset.financeTab); });
    $('#financeEventSearch').addEventListener('input', render); $('#financeExpenseSearch').addEventListener('input', render);
    $('#financeExportForm').addEventListener('submit', exportPackage);
    $('#financeExportForm [name="from"]').value = localDate().slice(0, 4) + '-01-01'; $('#financeExportForm [name="to"]').value = localDate();
  }
  const creditTotal = id => F.credited({id}, data.credits, localDate());
  return { load, render, bind, expense, payment, recurring, exportTables, creditTotal };
})();
