'use strict';

const db = fasteAuth.client;
const state = { contacts: [], services: [], documents: [], lines: [], events: [], eventTasks: [], materials: [], settings: {}, strategic: {}, forecast: null, forecastScenario: 'realistic', forecastChartMode: 'monthly', crmFilter: 'all', docFilter: 'all', eventFilter: 'all', editingContact: null, editingService: null, editingMaterial: null, editingDocument: null, editingEvent: null };
const pageMeta = {
  dashboard: ['Dashboard', 'L’essentiel de l’activité FASTE.'],
  crm: ['CRM', 'Contacts, clients, lieux et prestataires.'],
  documents: ['Devis & Factures', 'Créer, suivre, convertir et encaisser.'],
  events: ['Événements', 'Pense-bêtes opérationnels générés depuis les devis acceptés.'],
  prestations: ['Prestations', 'Catalogue de services et tarifs par défaut.'],
  materials: ['Matériel', 'Inventaire partagé et toujours à jour.'],
  strategy: ['Prévisionnel', 'Simuler, comparer et piloter la trajectoire financière de FASTE.'],
  settings: ['Paramètres', 'Informations légales et coordonnées de l’entreprise.']
};

const $ = (selector, root = document) => root.querySelector(selector);
const $$ = (selector, root = document) => [...root.querySelectorAll(selector)];
const esc = value => String(value ?? '').replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;' }[char]));
const euro = value => new Intl.NumberFormat('fr-FR', { style: 'currency', currency: 'EUR' }).format(Number(value) || 0);
const dateFr = value => value ? new Date(`${value}T00:00:00`).toLocaleDateString('fr-FR') : '—';
const today = () => new Date().toISOString().slice(0, 10);
const isoDate = value => value || null;
const num = value => Number(value) || 0;

function toast(message, error = false) {
  const el = $('#toast');
  el.textContent = message;
  el.className = `toast show${error ? ' error' : ''}`;
  clearTimeout(toast.timer);
  toast.timer = setTimeout(() => { el.className = 'toast'; }, 2800);
}

function setSync(mode = 'ok') {
  $('#syncDot').className = `sync-dot${mode === 'ok' ? '' : ` ${mode}`}`;
}

function openModal(id) {
  const modal = document.getElementById(id);
  modal.classList.add('open');
  modal.setAttribute('aria-hidden', 'false');
  document.body.style.overflow = 'hidden';
}

function closeModal(id) {
  const modal = document.getElementById(id);
  modal.classList.remove('open');
  modal.setAttribute('aria-hidden', 'true');
  if (!document.querySelector('.modal.open')) document.body.style.overflow = '';
}

function field(label, name, value = '', options = {}) {
  const { type = 'text', full = false, required = false, placeholder = '', choices = null, rows = 0, min = '', step = '', disabled = false } = options;
  let control;
  if (choices) {
    control = `<select name="${name}" ${required ? 'required' : ''} ${disabled ? 'disabled' : ''}>${choices.map(([v, l]) => `<option value="${esc(v)}" ${String(value ?? '') === String(v) ? 'selected' : ''}>${esc(l)}</option>`).join('')}</select>`;
  } else if (rows) {
    control = `<textarea name="${name}" rows="${rows}" placeholder="${esc(placeholder)}">${esc(value)}</textarea>`;
  } else {
    control = `<input name="${name}" type="${type}" value="${esc(value)}" placeholder="${esc(placeholder)}" ${required ? 'required' : ''} ${min !== '' ? `min="${min}"` : ''} ${step !== '' ? `step="${step}"` : ''} ${disabled ? 'disabled' : ''}>`;
  }
  return `<div class="field${full ? ' full' : ''}"><label>${esc(label)}</label>${control}</div>`;
}

function statusLabel(type, status) {
  const labels = type === 'devis'
    ? { draft: 'Brouillon', sent: 'Envoyé', accepted: 'Accepté', refused: 'Refusé' }
    : { unpaid: 'À payer', partial: 'Partiellement payée', paid: 'Payée', late: 'En retard' };
  return labels[status] || status || '—';
}

function relationLabel(status) {
  return ({ prospect: 'Prospect', client: 'Client', partenaire: 'Partenaire', ancien_client: 'Ancien client', perdu: 'Perdu' })[status] || status;
}

function effectiveStatus(doc) {
  if (doc.type === 'facture' && doc.status !== 'paid' && num(doc.remaining_amount) > 0 && doc.due_date && doc.due_date < today()) return 'late';
  return doc.status;
}

async function loadData({ quiet = false } = {}) {
  if (!quiet) setSync('loading');
  try {
    const queries = await Promise.all([
      db.from('contacts').select('*').order('updated_at', { ascending: false }),
      db.from('prestations').select('*').order('active', { ascending: false }).order('name'),
      db.from('documents').select('*').order('created_at', { ascending: false }),
      db.from('document_lines').select('*').order('position'),
      db.from('event_sheets').select('*').order('event_date', { ascending: true, nullsFirst: false }),
      db.from('event_tasks').select('*').order('position'),
      db.from('materiel').select('*').order('nom'),
      db.from('company_settings').select('*').eq('id', 1).maybeSingle(),
      db.from('faste_data').select('data').eq('id', 1).maybeSingle(),
      db.from('forecast_settings').select('*').eq('id', 1).maybeSingle()
    ]);
    const failed = queries.find(result => result.error);
    if (failed) throw failed.error;
    [state.contacts, state.services, state.documents, state.lines, state.events, state.eventTasks, state.materials] = queries.slice(0, 7).map(result => result.data || []);
    state.settings = queries[7].data || {};
    state.strategic = queries[8].data?.data?.business_data || {};
    state.forecast = normalizeForecast(queries[9].data?.data);
    state.forecastScenario = state.forecast.activeScenario;
    state.documents.forEach(doc => {
      doc.lines = state.lines.filter(line => line.document_id === doc.id).sort((a, b) => a.position - b.position);
      doc.contact = state.contacts.find(contact => contact.id === doc.contact_id) || null;
    });
    state.events.forEach(event => {
      event.tasks = state.eventTasks.filter(task => task.event_sheet_id === event.id).sort((a, b) => a.position - b.position);
      event.quote = state.documents.find(doc => doc.id === event.source_quote_id) || null;
      event.contact = state.contacts.find(contact => contact.id === event.contact_id) || null;
    });
    renderAll();
    setSync('ok');
  } catch (error) {
    console.error(error);
    setSync('error');
    if (!quiet) toast(`Chargement impossible : ${error.message}`, true);
  }
}

function renderAll() {
  renderDashboard();
  renderContacts();
  renderDocuments();
  renderEvents();
  renderServices();
  renderMaterials();
  renderSettings();
  renderForecast();
}

function renderDashboard() {
  const accepted = state.documents.filter(doc => doc.type === 'devis' && doc.status === 'accepted');
  const invoices = state.documents.filter(doc => doc.type === 'facture');
  const future = state.documents.filter(doc => doc.event_date && doc.event_date >= today()).sort((a, b) => a.event_date.localeCompare(b.event_date));
  $('#dashSigned').textContent = euro(accepted.reduce((sum, doc) => sum + num(doc.total_ttc), 0));
  $('#dashDue').textContent = euro(invoices.reduce((sum, doc) => sum + num(doc.remaining_amount), 0));
  $('#dashPending').textContent = state.documents.filter(doc => doc.type === 'devis' && doc.status === 'sent').length;
  $('#dashEvents').textContent = future.length;

  const actions = [];
  state.contacts.filter(contact => contact.next_action_date && contact.next_action_date <= today()).forEach(contact => actions.push({ icon: '◎', title: contact.next_action || `Relancer ${contact.name}`, sub: contact.name, date: contact.next_action_date, page: 'crm' }));
  invoices.filter(doc => effectiveStatus(doc) === 'late').forEach(doc => actions.push({ icon: '€', title: `Facture ${doc.number} en retard`, sub: doc.contact?.name || 'Client', date: doc.due_date, page: 'documents' }));
  state.documents.filter(doc => doc.type === 'devis' && doc.status === 'sent').forEach(doc => actions.push({ icon: '▣', title: `Relancer le devis ${doc.number}`, sub: doc.contact?.name || 'Client', date: doc.document_date, page: 'documents' }));
  $('#actionList').innerHTML = actions.length ? actions.slice(0, 8).map(action => `<button class="action-item" data-go="${action.page}" style="width:100%;background:none;border:0;color:inherit;text-align:left;cursor:pointer"><span class="action-icon">${action.icon}</span><span class="action-main"><strong>${esc(action.title)}</strong><small>${esc(action.sub)}</small></span><span class="action-date">${dateFr(action.date)}</span></button>`).join('') : '<div class="empty-state">Aucune action urgente. Tout est à jour.</div>';
  $('#eventList').innerHTML = future.length ? future.slice(0, 6).map(doc => `<button class="event-item" data-document="${doc.id}" style="width:100%;background:none;border:0;color:inherit;text-align:left;cursor:pointer"><span class="event-main"><strong>${esc(doc.event_type || 'Événement')}</strong><small>${esc(doc.contact?.name || 'Contact à préciser')}${doc.venue ? ` · ${esc(doc.venue)}` : ''}</small></span><span class="event-date">${dateFr(doc.event_date)}</span></button>`).join('') : '<div class="empty-state">Aucun événement à venir.</div>';
}

function renderContacts() {
  const query = ($('#contactSearch')?.value || '').toLowerCase().trim();
  let list = state.contacts.filter(contact => `${contact.name} ${contact.company || ''} ${contact.contact_name || ''} ${contact.city || ''} ${contact.email || ''}`.toLowerCase().includes(query));
  if (state.crmFilter === 'prospect') list = list.filter(contact => contact.relation_status === 'prospect');
  else if (state.crmFilter === 'client') list = list.filter(contact => contact.relation_status === 'client');
  else if (state.crmFilter === 'lieu' || state.crmFilter === 'prestataire') list = list.filter(contact => contact.type === state.crmFilter);
  $('#contactCount').textContent = `${list.length} contact${list.length > 1 ? 's' : ''}`;
  $('#contactsBody').innerHTML = list.length ? list.map(contact => `<tr><td><span class="cell-title">${esc(contact.name)}</span>${contact.contact_name ? `<span class="cell-sub">${esc(contact.contact_name)}</span>` : ''}</td><td><span class="badge">${esc(({ client: 'Client', lieu: 'Lieu', prestataire: 'Prestataire' })[contact.type])}</span></td><td><span class="badge ${contact.relation_status}">${esc(relationLabel(contact.relation_status))}</span></td><td>${esc(contact.email || contact.phone || '—')}${contact.email && contact.phone ? `<span class="cell-sub">${esc(contact.phone)}</span>` : ''}</td><td>${esc(contact.city || '—')}</td><td>${esc(contact.next_action || '—')}${contact.next_action_date ? `<span class="cell-sub">${dateFr(contact.next_action_date)}</span>` : ''}</td><td><div class="row-actions"><button class="mini-btn" data-edit-contact="${contact.id}">Ouvrir</button></div></td></tr>`).join('') : '<tr><td colspan="7"><div class="empty-state">Aucun contact trouvé.</div></td></tr>';
}

function openContact(id = null) {
  const contact = id ? state.contacts.find(item => item.id === id) : null;
  const displayName = contact?.company || contact?.name || '';
  const primaryContact = contact?.contact_name || (contact?.company ? contact.name : '');
  state.editingContact = contact?.id || null;
  $('#contactModalTitle').textContent = contact ? displayName : 'Nouveau contact';
  $('#contactForm').innerHTML = [
    field('Type', 'type', contact?.type || 'client', { choices: [['client', 'Client'], ['lieu', 'Lieu'], ['prestataire', 'Prestataire']], required: true }),
    field('Statut commercial', 'relation_status', contact?.relation_status || 'prospect', { choices: [['prospect', 'Prospect'], ['client', 'Client'], ['partenaire', 'Partenaire'], ['ancien_client', 'Ancien client'], ['perdu', 'Perdu']], required: true }),
    field('Nom du client / de la structure', 'name', displayName, { required: true, placeholder: 'Ex. AVC ou M. Bonnet' }),
    field('Interlocuteur principal', 'contact_name', primaryContact, { placeholder: 'Facultatif pour un particulier' }),
    field('Source', 'source', contact?.source, { placeholder: 'Recommandation, Google…' }),
    field('E-mail', 'email', contact?.email, { type: 'email' }),
    field('Téléphone', 'phone', contact?.phone, { type: 'tel' }),
    field('Adresse', 'address', contact?.address, { full: true }),
    field('Code postal', 'postal_code', contact?.postal_code),
    field('Ville', 'city', contact?.city),
    field('Prochaine action', 'next_action', contact?.next_action, { full: true, placeholder: 'Appeler, envoyer une proposition…' }),
    field('Date de relance', 'next_action_date', contact?.next_action_date, { type: 'date' }),
    field('Notes', 'notes', contact?.notes, { full: true, rows: 5 })
  ].join('');
  $('#deleteContactBtn').classList.toggle('hidden', !contact);
  openModal('contactModal');
}

async function saveContact(event) {
  event.preventDefault();
  const values = Object.fromEntries(new FormData(event.currentTarget));
  values.company = null;
  Object.keys(values).forEach(key => { if (values[key] === '') values[key] = null; });
  setSync('loading');
  const result = state.editingContact ? await db.from('contacts').update(values).eq('id', state.editingContact) : await db.from('contacts').insert(values);
  if (result.error) return handleError(result.error);
  closeModal('contactModal'); toast('Contact enregistré.'); await loadData({ quiet: true });
}

async function deleteContact() {
  if (!state.editingContact || !confirm('Supprimer ce contact ? Les contacts liés à un document sont protégés.')) return;
  const { error } = await db.from('contacts').delete().eq('id', state.editingContact);
  if (error) return handleError(error, 'Ce contact est utilisé dans un devis ou une facture et ne peut pas être supprimé.');
  closeModal('contactModal'); toast('Contact supprimé.'); await loadData({ quiet: true });
}

function renderDocuments() {
  const query = ($('#documentSearch')?.value || '').toLowerCase().trim();
  let list = state.documents.filter(doc => `${doc.number} ${doc.contact?.name || ''} ${doc.event_type || ''} ${doc.venue || ''}`.toLowerCase().includes(query));
  if (state.docFilter === 'devis' || state.docFilter === 'facture') list = list.filter(doc => doc.type === state.docFilter);
  else if (state.docFilter === 'pending') list = list.filter(doc => doc.type === 'devis' && doc.status === 'sent');
  else if (state.docFilter === 'unpaid') list = list.filter(doc => doc.type === 'facture' && num(doc.remaining_amount) > 0);
  $('#documentCount').textContent = `${list.length} document${list.length > 1 ? 's' : ''}`;
  $('#documentsBody').innerHTML = list.length ? list.map(doc => { const status = effectiveStatus(doc); return `<tr><td><span class="cell-title">${esc(doc.number)}</span></td><td>${doc.type === 'devis' ? 'Devis' : 'Facture'}</td><td>${esc(doc.contact?.name || '—')}</td><td>${esc(doc.event_type || '—')}${doc.venue ? `<span class="cell-sub">${esc(doc.venue)}</span>` : ''}</td><td>${dateFr(doc.event_date)}</td><td><strong>${euro(doc.total_ttc)}</strong></td><td><span class="badge ${status}">${esc(statusLabel(doc.type, status))}</span></td><td><div class="row-actions"><button class="mini-btn" data-pdf-document="${doc.id}">PDF</button><button class="mini-btn" data-edit-document="${doc.id}">Ouvrir</button></div></td></tr>`; }).join('') : '<tr><td colspan="8"><div class="empty-state">Aucun document trouvé.</div></td></tr>';
}

function documentStatusChoices(type) {
  return type === 'devis' ? [['draft', 'Brouillon'], ['sent', 'Envoyé'], ['accepted', 'Accepté'], ['refused', 'Refusé']] : [['unpaid', 'À payer'], ['partial', 'Partiellement payée'], ['paid', 'Payée'], ['late', 'En retard']];
}

function renderDocumentFields(doc = {}) {
  const type = doc.type || $('#documentForm [name="type"]')?.value || 'devis';
  const contacts = [...state.contacts].sort((a, b) => a.name.localeCompare(b.name, 'fr')).map(contact => [contact.id, `${contact.name}${contact.city ? ` — ${contact.city}` : ''}`]);
  const venues = state.contacts.filter(contact => contact.type === 'lieu').map(contact => contact.name);
  $('#documentFields').innerHTML = [
    field('Type de document', 'type', type, { choices: [['devis', 'Devis'], ['facture', 'Facture']], disabled: Boolean(state.editingDocument) }),
    field('Numéro', 'number', doc.number || 'Généré automatiquement', { disabled: true }),
    field('Client / contact', 'contact_id', doc.contact_id || '', { choices: [['', '— Sélectionner —'], ...contacts], required: true, full: true }),
    field('Type d’événement', 'event_type', doc.event_type, { placeholder: 'Mariage, soirée corporate…' }),
    field('Date de l’événement', 'event_date', doc.event_date, { type: 'date' }),
    field('Lieu', 'venue', doc.venue, { placeholder: venues[0] || 'Lieu de réception' }),
    field('Date du document', 'document_date', doc.document_date || today(), { type: 'date', required: true }),
    field('Statut', 'status', doc.status || (type === 'facture' ? 'unpaid' : 'draft'), { choices: documentStatusChoices(type), required: true }),
    ...(type === 'facture' ? [field('Échéance de paiement', 'due_date', doc.due_date, { type: 'date' }), field('Montant encaissé', 'paid_amount', doc.paid_amount || 0, { type: 'number', min: 0, step: '0.01' })] : [])
  ].join('') + `<datalist id="venueOptions">${venues.map(name => `<option value="${esc(name)}">`).join('')}</datalist>`;
  const venueInput = $('#documentForm [name="venue"]'); if (venueInput) venueInput.setAttribute('list', 'venueOptions');
  $('#documentEyebrow').textContent = type.toUpperCase();
  $('#remainingRow').classList.toggle('hidden', type !== 'facture');
  $('#documentForm [name="type"]')?.addEventListener('change', event => { renderDocumentFields({ ...readDocumentHeader(), type: event.target.value, status: event.target.value === 'facture' ? 'unpaid' : 'draft' }); calculateDocument(); });
  $('#documentForm [name="paid_amount"]')?.addEventListener('input', calculateDocument);
}

function readDocumentHeader() {
  const data = Object.fromEntries(new FormData($('#documentForm')));
  const disabledType = $('#documentForm [name="type"]')?.value;
  return { ...data, type: disabledType || 'devis', notes: $('#docNotes').value };
}

function openDocument(id = null, preset = {}) {
  const existing = id ? state.documents.find(doc => doc.id === id) : null;
  const doc = existing || { type: preset.type || 'devis', document_date: today(), status: preset.type === 'facture' ? 'unpaid' : 'draft', contact_id: preset.contact_id || '', lines: [] };
  state.editingDocument = existing?.id || null;
  $('#documentModalTitle').textContent = existing ? `${existing.type === 'devis' ? 'Devis' : 'Facture'} ${existing.number}` : `Nouveau ${doc.type}`;
  renderDocumentFields(doc);
  $('#docNotes').value = doc.notes || '';
  $('#documentLines').innerHTML = '';
  (doc.lines?.length ? doc.lines : [null]).forEach(line => addDocumentLine(line));
  $('#deleteDocumentBtn').classList.toggle('hidden', !existing);
  $('#pdfDocumentBtn').classList.toggle('hidden', !existing);
  $('#convertDocumentBtn').classList.toggle('hidden', !(existing?.type === 'devis' && !state.documents.some(item => item.source_quote_id === existing.id)));
  calculateDocument(); openModal('documentModal');
}

function addDocumentLine(line = {}) {
  const row = document.createElement('div');
  row.className = 'doc-line';
  row.dataset.prestationId = line?.prestation_id || line?.id || '';
  row.innerHTML = `<input class="line-description" aria-label="Description" placeholder="Description de la prestation" value="${esc(line?.description || line?.name || '')}"><input class="line-quantity" aria-label="Quantité" type="number" min="0.01" step="0.01" value="${num(line?.quantity) || 1}"><input class="line-price" aria-label="Prix HT" type="number" min="0" step="0.01" value="${num(line?.unit_price_ht ?? line?.default_price_ht)}"><select class="line-vat" aria-label="TVA"><option value="20">20 %</option><option value="10">10 %</option><option value="5.5">5,5 %</option><option value="0">0 %</option></select><strong class="line-total">0 €</strong><button class="icon-btn line-remove" type="button" aria-label="Supprimer">✕</button>`;
  $('.line-vat', row).value = String(line?.vat_rate ?? 20);
  $$('input,select', row).forEach(input => input.addEventListener('input', calculateDocument));
  $('.line-remove', row).addEventListener('click', () => { row.remove(); calculateDocument(); });
  $('#documentLines').appendChild(row); calculateDocument();
}

function readDocumentLines() {
  return $$('.doc-line', $('#documentLines')).map(row => ({ prestation_id: row.dataset.prestationId || null, description: $('.line-description', row).value.trim(), quantity: num($('.line-quantity', row).value), unit_price_ht: num($('.line-price', row).value), vat_rate: num($('.line-vat', row).value) })).filter(line => line.description);
}

function documentTotals(lines = readDocumentLines()) {
  return lines.reduce((totals, line) => { const ht = line.quantity * line.unit_price_ht; totals.ht += ht; totals.vat += ht * line.vat_rate / 100; totals.ttc = totals.ht + totals.vat; return totals; }, { ht: 0, vat: 0, ttc: 0 });
}

function calculateDocument() {
  const totals = documentTotals();
  $('#docTotalHt').textContent = euro(totals.ht); $('#docTotalVat').textContent = euro(totals.vat); $('#docTotalTtc').textContent = euro(totals.ttc);
  const paid = num($('#documentForm [name="paid_amount"]')?.value); $('#docRemaining').textContent = euro(Math.max(0, totals.ttc - paid));
  $$('.doc-line', $('#documentLines')).forEach(row => { const total = num($('.line-quantity', row).value) * num($('.line-price', row).value) * (1 + num($('.line-vat', row).value) / 100); $('.line-total', row).textContent = euro(total); });
}

function openCatalog() {
  const active = state.services.filter(service => service.active);
  $('#catalogList').innerHTML = active.length ? active.map(service => `<div class="catalog-item"><div><strong>${esc(service.name)}</strong><small>${esc(service.description || '')} · ${euro(service.default_price_ht)} HT · TVA ${num(service.vat_rate)} %</small></div><button class="btn primary" data-add-service="${service.id}">Ajouter</button></div>`).join('') : '<div class="empty-state">Aucune prestation active dans le catalogue.</div>';
  openModal('catalogModal');
}

async function saveDocument(event) {
  event.preventDefault();
  const header = readDocumentHeader();
  const lines = readDocumentLines();
  if (!header.contact_id) return toast('Sélectionne un client ou un contact.', true);
  if (!lines.length) return toast('Ajoute au moins une prestation.', true);
  const payload = { ...header, id: state.editingDocument, event_date: isoDate(header.event_date), due_date: isoDate(header.due_date), paid_amount: num(header.paid_amount) };
  setSync('loading');
  const { error } = await db.rpc('save_faste_document', { p_document: payload, p_lines: lines });
  if (error) return handleError(error);
  closeModal('documentModal'); toast('Document enregistré et partagé.'); await loadData({ quiet: true });
}

async function deleteDocument() {
  if (!state.editingDocument || !confirm('Supprimer définitivement ce document ?')) return;
  const { error } = await db.from('documents').delete().eq('id', state.editingDocument);
  if (error) return handleError(error);
  closeModal('documentModal'); toast('Document supprimé.'); await loadData({ quiet: true });
}

async function convertDocument() {
  const quote = state.documents.find(doc => doc.id === state.editingDocument);
  if (!quote) return;
  if (quote.status !== 'accepted' && !confirm('Le devis sera marqué comme accepté puis transformé en facture. Continuer ?')) return;
  setSync('loading');
  const { data, error } = await db.rpc('convert_quote_to_invoice', { p_quote_id: quote.id, p_due_date: null });
  if (error) return handleError(error);
  closeModal('documentModal'); await loadData({ quiet: true }); toast(`Facture ${data.number} créée.`); openDocument(data.id);
}

function eventStatusLabel(status) {
  return ({ preparation: 'À préparer', confirmed: 'Confirmé', completed: 'Terminé' })[status] || status || '—';
}

function renderEvents() {
  const container = $('#eventsGrid');
  if (!container) return;
  const query = ($('#eventSearch')?.value || '').toLowerCase().trim();
  let list = state.events.filter(event => `${event.title} ${event.venue || ''} ${event.contact?.name || ''} ${event.quote?.number || ''}`.toLowerCase().includes(query));
  if (state.eventFilter === 'upcoming') list = list.filter(event => event.event_date && event.event_date >= today() && event.status !== 'completed');
  else if (state.eventFilter !== 'all') list = list.filter(event => event.status === state.eventFilter);
  list.sort((a, b) => (a.event_date || '9999-12-31').localeCompare(b.event_date || '9999-12-31'));
  $('#eventCount').textContent = `${list.length} fiche${list.length > 1 ? 's' : ''}`;
  container.innerHTML = list.length ? list.map(event => {
    const total = event.tasks.length;
    const done = event.tasks.filter(task => task.is_done).length;
    const progress = total ? Math.round((done / total) * 100) : 0;
    return `<button class="event-card" data-edit-event="${event.id}"><span class="event-card-top"><h3>${esc(event.title)}</h3><span class="badge ${esc(event.status)}">${esc(eventStatusLabel(event.status))}</span></span><span class="event-card-meta"><span>◷ ${dateFr(event.event_date)}${event.venue ? ` · ${esc(event.venue)}` : ''}</span><span>◎ ${esc(event.contact?.name || 'Contact à préciser')}${event.assigned_to ? ` · ${esc(event.assigned_to)}` : ''}</span></span><span class="event-progress"><span style="width:${progress}%"></span></span><span class="event-progress-label"><span>${done}/${total} tâches</span><span>${progress} %</span></span></button>`;
  }).join('') : '<div class="empty-state panel">Aucune fiche événement dans cette vue. Elle apparaîtra automatiquement dès qu’un devis sera accepté.</div>';
}

function renderEventTasks(tasks = []) {
  const list = $('#eventTaskList');
  list.innerHTML = '';
  tasks.forEach(task => addEventTask(task));
}

function addEventTask(task = {}) {
  const row = document.createElement('div');
  row.className = `task-item${task.is_done ? ' done' : ''}`;
  row.dataset.taskId = task.id || '';
  row.dataset.sourceKey = task.source_key || `manual:${globalThis.crypto?.randomUUID?.() || `${Date.now()}-${Math.random()}`}`;
  row.dataset.category = task.category || 'general';
  row.innerHTML = `<input class="task-done" type="checkbox" aria-label="Tâche terminée" ${task.is_done ? 'checked' : ''}><input class="task-label" type="text" aria-label="Tâche" value="${esc(task.label || '')}" placeholder="Nouvelle tâche"><select class="task-owner" aria-label="Responsable"><option value="">Non attribué</option><option value="Maxime">Maxime</option><option value="Paul">Paul</option><option value="Les deux">Les deux</option></select><button class="task-delete" type="button" aria-label="Supprimer">✕</button>`;
  $('.task-owner', row).value = task.assigned_to || '';
  $('.task-done', row).addEventListener('change', event => row.classList.toggle('done', event.target.checked));
  $('.task-delete', row).addEventListener('click', () => row.remove());
  $('#eventTaskList').appendChild(row);
}

function readEventTasks() {
  return $$('.task-item', $('#eventTaskList')).map((row, position) => ({
    id: row.dataset.taskId || null,
    source_key: row.dataset.sourceKey,
    category: row.dataset.category || 'general',
    label: $('.task-label', row).value.trim(),
    is_done: $('.task-done', row).checked,
    assigned_to: $('.task-owner', row).value || null,
    position
  })).filter(task => task.label);
}

function openEvent(id) {
  const event = state.events.find(item => item.id === id);
  if (!event) return;
  state.editingEvent = event.id;
  $('#eventModalTitle').textContent = event.title;
  $('#eventModalSubtitle').textContent = `${event.quote?.number || 'Devis accepté'} · ${event.contact?.name || 'Contact à préciser'}`;
  const quoteLines = event.quote?.lines?.map(line => line.description).filter(Boolean) || [];
  $('#eventFields').innerHTML = [
    field('Nom de l’événement', 'title', event.title, { required: true, full: true }),
    field('Statut', 'status', event.status, { choices: [['preparation', 'À préparer'], ['confirmed', 'Confirmé'], ['completed', 'Terminé']], required: true }),
    field('Responsable', 'assigned_to', event.assigned_to || '', { choices: [['', 'Non attribué'], ['Maxime', 'Maxime'], ['Paul', 'Paul'], ['Les deux', 'Les deux']] }),
    field('Date', 'event_date', event.event_date, { type: 'date' }),
    field('Lieu', 'venue', event.venue),
    field('Contact sur place', 'contact_on_site', event.contact_on_site),
    field('Téléphone sur place', 'contact_on_site_phone', event.contact_on_site_phone, { type: 'tel' }),
    field('Arrivée / installation', 'setup_time', event.setup_time, { type: 'time' }),
    field('Début', 'start_time', event.start_time, { type: 'time' }),
    field('Fin', 'end_time', event.end_time, { type: 'time' }),
    field('Démontage', 'teardown_time', event.teardown_time, { type: 'time' })
  ].join('') + `<div class="quote-summary"><strong>Base issue du devis ${esc(event.quote?.number || '')}</strong>${quoteLines.length ? ` · ${quoteLines.map(esc).join(' · ')}` : ''}</div>`;
  $('#eventNotes').innerHTML = [
    ['Déroulé / horaires', 'schedule_notes'],
    ['Musique et moments clés', 'music_notes'],
    ['Technique', 'technical_notes'],
    ['Accès, stationnement et contraintes', 'access_notes'],
    ['Autres informations utiles', 'general_notes']
  ].map(([label, name]) => `<label>${label}<textarea name="${name}" rows="3">${esc(event[name] || '')}</textarea></label>`).join('');
  renderEventTasks(event.tasks);
  openModal('eventModal');
}

async function saveEvent(event) {
  event.preventDefault();
  const sheet = state.events.find(item => item.id === state.editingEvent);
  if (!sheet) return;
  const values = Object.fromEntries(new FormData(event.currentTarget));
  $$('textarea[name]', $('#eventNotes')).forEach(input => { values[input.name] = input.value; });
  Object.keys(values).forEach(key => { if (values[key] === '') values[key] = null; });
  const tasks = readEventTasks();
  const retainedIds = new Set(tasks.map(task => task.id).filter(Boolean));
  const removedIds = sheet.tasks.filter(task => !retainedIds.has(task.id)).map(task => task.id);
  setSync('loading');
  const sheetResult = await db.from('event_sheets').update(values).eq('id', sheet.id);
  if (sheetResult.error) return handleError(sheetResult.error);
  if (removedIds.length) {
    const result = await db.from('event_tasks').delete().in('id', removedIds);
    if (result.error) return handleError(result.error);
  }
  const existing = tasks.filter(task => task.id);
  const created = tasks.filter(task => !task.id).map(({ id, ...task }) => ({ ...task, event_sheet_id: sheet.id }));
  const results = await Promise.all(existing.map(({ id, ...task }) => db.from('event_tasks').update(task).eq('id', id)));
  if (created.length) results.push(await db.from('event_tasks').insert(created));
  const failed = results.find(result => result.error);
  if (failed) return handleError(failed.error);
  closeModal('eventModal'); toast('Fiche événement enregistrée.'); await loadData({ quiet: true });
}

function renderServices() {
  $('#servicesBody').innerHTML = state.services.length ? state.services.map(service => `<tr><td><span class="cell-title">${esc(service.name)}</span></td><td>${esc(service.description || '—')}</td><td><strong>${euro(service.default_price_ht)}</strong></td><td>${num(service.vat_rate)} %</td><td><span class="badge ${service.active ? 'active' : 'inactive'}">${service.active ? 'Active' : 'Inactive'}</span></td><td><div class="row-actions"><button class="mini-btn" data-edit-service="${service.id}">Modifier</button></div></td></tr>`).join('') : '<tr><td colspan="6"><div class="empty-state">Aucune prestation.</div></td></tr>';
}

function openService(id = null) {
  const service = id ? state.services.find(item => item.id === id) : null;
  state.editingService = service?.id || null;
  $('#serviceModalTitle').textContent = service ? service.name : 'Nouvelle prestation';
  $('#serviceForm').innerHTML = [field('Nom', 'name', service?.name, { required: true, full: true }), field('Description', 'description', service?.description, { full: true, rows: 3 }), field('Prix HT', 'default_price_ht', service?.default_price_ht || 0, { type: 'number', min: 0, step: '0.01', required: true }), field('TVA', 'vat_rate', service?.vat_rate ?? 20, { choices: [['20', '20 %'], ['10', '10 %'], ['5.5', '5,5 %'], ['0', '0 %']] }), field('Statut', 'active', String(service?.active ?? true), { choices: [['true', 'Active'], ['false', 'Inactive']], full: true })].join('');
  $('#deleteServiceBtn').classList.toggle('hidden', !service || !service.active); openModal('serviceModal');
}

async function saveService(event) {
  event.preventDefault(); const values = Object.fromEntries(new FormData(event.currentTarget));
  values.default_price_ht = num(values.default_price_ht); values.vat_rate = num(values.vat_rate); values.active = values.active === 'true'; if (!values.description) values.description = null;
  const result = state.editingService ? await db.from('prestations').update(values).eq('id', state.editingService) : await db.from('prestations').insert(values);
  if (result.error) return handleError(result.error); closeModal('serviceModal'); toast('Prestation enregistrée.'); await loadData({ quiet: true });
}

async function disableService() {
  if (!state.editingService) return; const { error } = await db.from('prestations').update({ active: false }).eq('id', state.editingService);
  if (error) return handleError(error); closeModal('serviceModal'); toast('Prestation désactivée.'); await loadData({ quiet: true });
}

function renderMaterials() {
  $('#materialsBody').innerHTML = state.materials.length ? state.materials.map(material => `<tr><td><span class="cell-title">${esc(material.nom)}</span></td><td>${esc(material.categorie || '—')}</td><td><strong>${num(material.quantite)}</strong></td><td>${esc(material.etat || '—')}</td><td>${esc(material.utilisation || '—')}</td><td>${material.valeur_actuelle == null ? 'À renseigner' : euro(material.valeur_actuelle)}</td><td><div class="row-actions"><button class="mini-btn" data-edit-material="${material.id}">Modifier</button></div></td></tr>`).join('') : '<tr><td colspan="7"><div class="empty-state">Aucun matériel.</div></td></tr>';
}

function openMaterial(id = null) {
  const material = id ? state.materials.find(item => item.id === id) : null; state.editingMaterial = material?.id || null;
  $('#materialModalTitle').textContent = material ? material.nom : 'Nouveau matériel';
  $('#materialForm').innerHTML = [field('Nom', 'nom', material?.nom, { required: true, full: true }), field('Catégorie', 'categorie', material?.categorie), field('Quantité', 'quantite', material?.quantite || 1, { type: 'number', min: 0, step: 1, required: true }), field('État', 'etat', material?.etat), field('Utilisation', 'utilisation', material?.utilisation), field('Valeur d’achat unitaire', 'valeur_achat', material?.valeur_achat, { type: 'number', min: 0, step: '0.01' }), field('Valeur actuelle unitaire', 'valeur_actuelle', material?.valeur_actuelle, { type: 'number', min: 0, step: '0.01' }), field('Maintenance', 'maintenance', material?.maintenance), field('Notes', 'notes', material?.notes, { full: true, rows: 4 })].join('');
  $('#deleteMaterialBtn').classList.toggle('hidden', !material); openModal('materialModal');
}

async function saveMaterial(event) {
  event.preventDefault(); const values = Object.fromEntries(new FormData(event.currentTarget));
  values.quantite = num(values.quantite); ['valeur_achat', 'valeur_actuelle'].forEach(key => values[key] = values[key] === '' ? null : num(values[key])); Object.keys(values).forEach(key => { if (values[key] === '') values[key] = null; });
  const result = state.editingMaterial ? await db.from('materiel').update(values).eq('id', state.editingMaterial) : await db.from('materiel').insert(values);
  if (result.error) return handleError(result.error); closeModal('materialModal'); toast('Matériel enregistré.'); await loadData({ quiet: true });
}

async function deleteMaterial() {
  if (!state.editingMaterial || !confirm('Supprimer ce matériel ?')) return; const { error } = await db.from('materiel').delete().eq('id', state.editingMaterial);
  if (error) return handleError(error); closeModal('materialModal'); toast('Matériel supprimé.'); await loadData({ quiet: true });
}

function renderSettings() {
  const s = state.settings;
  $('#settingsForm').innerHTML = [field('Nom de l’entreprise', 'company_name', s.company_name, { required: true }), field('Forme juridique', 'legal_form', s.legal_form), field('Capital social', 'capital', s.capital), field('N° de TVA', 'vat_number', s.vat_number), field('SIREN', 'siren', s.siren), field('SIRET', 'siret', s.siret), field('Adresse', 'address', s.address, { full: true }), field('Code postal', 'postal_code', s.postal_code), field('Ville', 'city', s.city), field('Téléphone', 'phone', s.phone), field('E-mail', 'email', s.email, { type: 'email' }), field('Site internet', 'website', s.website), field('IBAN', 'iban', s.iban, { full: true }), field('BIC', 'bic', s.bic)].join('');
}

async function saveSettings(event) {
  event.preventDefault(); const values = Object.fromEntries(new FormData(event.currentTarget)); Object.keys(values).forEach(key => { if (values[key] === '') values[key] = null; });
  const { error } = await db.from('company_settings').upsert({ id: 1, ...values }); if (error) return handleError(error); toast('Paramètres enregistrés.'); await loadData({ quiet: true });
}

const forecastMonths = ['Janv.', 'Févr.', 'Mars', 'Avr.', 'Mai', 'Juin', 'Juil.', 'Août', 'Sept.', 'Oct.', 'Nov.', 'Déc.'];

function emptyForecastScenario(source = {}) {
  return {
    basket: num(source.basket),
    variableCost: num(source.variableCost),
    openingCash: num(source.openingCash),
    taxRate: Math.min(100, Math.max(0, num(source.taxRate))),
    maximePay: num(source.maximePay),
    paulPay: num(source.paulPay),
    monthlyEvents: Array.from({ length: 12 }, (_, index) => Math.max(0, Math.round(num(source.monthlyEvents?.[index])))),
    expenses: Array.isArray(source.expenses) ? source.expenses.map(item => ({ id: item.id || `expense-${Date.now()}-${Math.random()}`, label: String(item.label || ''), monthlyAmount: Math.max(0, num(item.monthlyAmount)) })) : [],
    investments: Array.isArray(source.investments) ? source.investments.map(item => ({ id: item.id || `investment-${Date.now()}-${Math.random()}`, label: String(item.label || ''), month: Math.min(11, Math.max(0, Math.round(num(item.month)))), amount: Math.max(0, num(item.amount)) })) : []
  };
}

function normalizeForecast(data = {}) {
  const source = data && typeof data === 'object' ? data : {};
  return {
    version: 1,
    year: Math.min(2100, Math.max(2024, Math.round(num(source.year) || new Date().getFullYear()))),
    activeScenario: ['prudent', 'realistic', 'ambitious'].includes(source.activeScenario) ? source.activeScenario : 'realistic',
    scenarios: {
      prudent: emptyForecastScenario(source.scenarios?.prudent),
      realistic: emptyForecastScenario(source.scenarios?.realistic),
      ambitious: emptyForecastScenario(source.scenarios?.ambitious)
    }
  };
}

function activeForecast() {
  return state.forecast.scenarios[state.forecastScenario];
}

function renderForecast() {
  if (!$('#forecastYear')) return;
  const model = activeForecast();
  $('#forecastYear').value = state.forecast.year;
  $$('#forecastScenarios button').forEach(button => button.classList.toggle('active', button.dataset.scenario === state.forecastScenario));
  $('#forecastBasket').value = model.basket;
  $('#forecastVariable').value = model.variableCost;
  $('#forecastOpeningCash').value = model.openingCash;
  $('#forecastTaxRate').value = model.taxRate;
  $('#forecastMaximePay').value = model.maximePay;
  $('#forecastPaulPay').value = model.paulPay;
  $('#forecastMonthInputs').innerHTML = forecastMonths.map((month, index) => `<label><span>${month}</span><input type="number" min="0" step="1" value="${model.monthlyEvents[index]}" data-forecast-month="${index}" aria-label="Événements en ${month}"></label>`).join('');
  renderForecastExpenses();
  renderForecastInvestments();
  $('#forecastSaveState').textContent = 'À jour';
  $('#forecastSaveState').classList.remove('dirty');
  calculateForecast();
}

function renderForecastExpenses() {
  const model = activeForecast();
  $('#forecastExpenses').innerHTML = model.expenses.length ? model.expenses.map(item => `<div class="forecast-line" data-forecast-expense="${esc(item.id)}"><input class="forecast-line-label" value="${esc(item.label)}" placeholder="Nom de la charge" aria-label="Nom de la charge"><label><span>Par mois</span><input class="forecast-line-amount" type="number" min="0" step="10" value="${num(item.monthlyAmount)}" aria-label="Montant mensuel"></label><button class="task-delete" type="button" data-remove-forecast-line aria-label="Supprimer">✕</button></div>`).join('') : '<div class="forecast-empty">Aucune charge renseignée.</div>';
}

function renderForecastInvestments() {
  const model = activeForecast();
  $('#forecastInvestments').innerHTML = model.investments.length ? model.investments.map(item => `<div class="forecast-line investment" data-forecast-investment="${esc(item.id)}"><input class="forecast-line-label" value="${esc(item.label)}" placeholder="Nom de l’investissement" aria-label="Nom de l’investissement"><select class="forecast-line-month" aria-label="Mois prévu">${forecastMonths.map((month, index) => `<option value="${index}" ${index === num(item.month) ? 'selected' : ''}>${month}</option>`).join('')}</select><label><span>Montant</span><input class="forecast-line-amount" type="number" min="0" step="50" value="${num(item.amount)}" aria-label="Montant de l’investissement"></label><button class="task-delete" type="button" data-remove-forecast-line aria-label="Supprimer">✕</button></div>`).join('') : '<div class="forecast-empty">Aucun investissement renseigné.</div>';
}

function readForecastInputs() {
  const model = activeForecast();
  model.basket = num($('#forecastBasket').value);
  model.variableCost = num($('#forecastVariable').value);
  model.openingCash = num($('#forecastOpeningCash').value);
  model.taxRate = Math.min(100, Math.max(0, num($('#forecastTaxRate').value)));
  model.maximePay = num($('#forecastMaximePay').value);
  model.paulPay = num($('#forecastPaulPay').value);
  model.monthlyEvents = $$('[data-forecast-month]').map(input => Math.max(0, Math.round(num(input.value))));
  model.expenses = $$('[data-forecast-expense]').map(row => ({ id: row.dataset.forecastExpense, label: $('.forecast-line-label', row).value.trim(), monthlyAmount: Math.max(0, num($('.forecast-line-amount', row).value)) }));
  model.investments = $$('[data-forecast-investment]').map(row => ({ id: row.dataset.forecastInvestment, label: $('.forecast-line-label', row).value.trim(), month: Math.round(num($('.forecast-line-month', row).value)), amount: Math.max(0, num($('.forecast-line-amount', row).value)) }));
  state.forecast.year = Math.min(2100, Math.max(2024, Math.round(num($('#forecastYear').value) || new Date().getFullYear())));
  state.forecast.activeScenario = state.forecastScenario;
  return model;
}

function markForecastDirty() {
  const status = $('#forecastSaveState');
  status.textContent = 'Modifications non enregistrées';
  status.classList.add('dirty');
}

function addForecastExpense() {
  readForecastInputs();
  activeForecast().expenses.push({ id: `expense-${Date.now()}-${Math.random()}`, label: '', monthlyAmount: 0 });
  renderForecastExpenses(); markForecastDirty(); calculateForecast();
  $('#forecastExpenses .forecast-line:last-child .forecast-line-label')?.focus();
}

function addForecastInvestment() {
  readForecastInputs();
  activeForecast().investments.push({ id: `investment-${Date.now()}-${Math.random()}`, label: '', month: 0, amount: 0 });
  renderForecastInvestments(); markForecastDirty(); calculateForecast();
  $('#forecastInvestments .forecast-line:last-child .forecast-line-label')?.focus();
}

function forecastActuals(year) {
  const monthlyInvoiced = Array(12).fill(0);
  const invoices = state.documents.filter(doc => doc.type === 'facture' && String(doc.document_date || '').startsWith(String(year)));
  invoices.forEach(doc => { const month = new Date(`${doc.document_date}T00:00:00`).getMonth(); monthlyInvoiced[month] += num(doc.total_ht); });
  const accepted = state.documents.filter(doc => doc.type === 'devis' && doc.status === 'accepted' && String(doc.event_date || doc.document_date || '').startsWith(String(year)));
  return {
    monthlyInvoiced,
    invoiced: invoices.reduce((sum, doc) => sum + num(doc.total_ht), 0),
    signed: accepted.reduce((sum, doc) => sum + num(doc.total_ht), 0),
    outstanding: invoices.reduce((sum, doc) => sum + num(doc.remaining_amount), 0),
    acceptedEvents: accepted.length
  };
}

function calculateForecast() {
  if (!state.forecast || !$('#forecastBasket')) return;
  const model = readForecastInputs();
  const fixedMonthly = model.expenses.reduce((sum, item) => sum + num(item.monthlyAmount), 0);
  const payMonthly = model.maximePay + model.paulPay;
  const actual = forecastActuals(state.forecast.year);
  let cash = model.openingCash;
  const rows = forecastMonths.map((month, index) => {
    const events = model.monthlyEvents[index];
    const revenue = events * model.basket;
    const variable = events * model.variableCost;
    const operating = revenue - variable - fixedMonthly - payMonthly;
    const tax = Math.max(0, operating) * model.taxRate / 100;
    const result = operating - tax;
    const investments = model.investments.filter(item => num(item.month) === index).reduce((sum, item) => sum + num(item.amount), 0);
    cash += result - investments;
    return { month, events, revenue, actualRevenue: actual.monthlyInvoiced[index], variable, fixed: fixedMonthly, pay: payMonthly, operating, tax, result, investments, cash };
  });
  const total = key => rows.reduce((sum, row) => sum + num(row[key]), 0);
  const revenue = total('revenue'), grossMargin = revenue - total('variable'), result = total('result'), investments = total('investments');
  const eventTotal = total('events');
  const contribution = model.basket - model.variableCost;
  const annualStructure = (fixedMonthly + payMonthly) * 12;
  const breakEven = contribution > 0 ? Math.ceil(annualStructure / contribution) : null;
  $('#forecastRevenue').textContent = euro(revenue);
  $('#forecastRevenueActual').textContent = `Réalisé : ${euro(actual.invoiced)}`;
  $('#forecastGrossMargin').textContent = euro(grossMargin);
  $('#forecastMarginRate').textContent = `${revenue ? Math.round(grossMargin / revenue * 100) : 0} % du CA`;
  $('#forecastResult').textContent = euro(result);
  $('#forecastResult').classList.toggle('negative', result < 0);
  $('#forecastCash').textContent = euro(cash);
  $('#forecastCash').classList.toggle('negative', cash < 0);
  $('#forecastCashAlert').textContent = cash < 0 ? 'Besoin de financement à anticiper' : `Après ${euro(investments)} d’investissements`;
  $('#forecastBreakEven').textContent = breakEven == null ? '—' : `${breakEven} événement${breakEven > 1 ? 's' : ''}`;
  $('#forecastEventTotal').textContent = `${eventTotal} événement${eventTotal > 1 ? 's' : ''}`;
  $('#forecastExpenseTotal').textContent = euro(fixedMonthly * 12);
  $('#forecastInvestmentTotal').textContent = euro(investments);
  $('#actualInvoiced').textContent = euro(actual.invoiced);
  $('#actualSigned').textContent = euro(actual.signed);
  $('#actualOutstanding').textContent = euro(actual.outstanding);
  $('#actualAcceptedEvents').textContent = actual.acceptedEvents;
  const progress = revenue > 0 ? Math.round(actual.invoiced / revenue * 100) : 0;
  $('#actualProgressLabel').textContent = `${progress} %`;
  $('#actualProgressBar').style.width = `${Math.min(100, progress)}%`;
  renderForecastChart(rows);
  $('#forecastTableBody').innerHTML = rows.map(row => `<tr><td><strong>${row.month}</strong></td><td>${row.events}</td><td>${euro(row.revenue)}</td><td>${euro(row.variable)}</td><td>${euro(row.fixed)}</td><td>${euro(row.pay)}</td><td class="${row.result < 0 ? 'negative-cell' : 'positive-cell'}">${euro(row.result)}</td><td>${euro(row.investments)}</td><td class="${row.cash < 0 ? 'negative-cell' : ''}">${euro(row.cash)}</td></tr>`).join('');
}

function renderForecastChart(rows) {
  let forecastValues = rows.map(row => row.revenue);
  let actualValues = rows.map(row => row.actualRevenue);
  if (state.forecastChartMode === 'cumulative') {
    forecastValues = forecastValues.map((_, index) => forecastValues.slice(0, index + 1).reduce((sum, value) => sum + value, 0));
    actualValues = actualValues.map((_, index) => actualValues.slice(0, index + 1).reduce((sum, value) => sum + value, 0));
  }
  const max = Math.max(1, ...forecastValues, ...actualValues);
  $('#forecastChartSubtitle').textContent = state.forecastChartMode === 'cumulative' ? 'Progression cumulée sur l’exercice.' : 'Prévisionnel et facturation réelle par mois.';
  $('#forecastChart').innerHTML = forecastMonths.map((month, index) => {
    const forecastHeight = Math.max(1, forecastValues[index] / max * 100);
    const actualHeight = actualValues[index] ? Math.max(1, actualValues[index] / max * 100) : 0;
    return `<div class="forecast-chart-month"><div class="forecast-bars"><span class="forecast-bar" style="height:${forecastHeight}%" title="${month} · Prévisionnel ${euro(forecastValues[index])}"></span><span class="actual-bar" style="height:${actualHeight}%" title="${month} · Réalisé ${euro(actualValues[index])}"></span></div><small>${month}</small></div>`;
  }).join('');
}

async function saveForecast() {
  readForecastInputs();
  const { data: sessionData } = await db.auth.getSession();
  const userId = sessionData.session?.user?.id;
  if (!userId) return toast('Session expirée. Reconnecte-toi.', true);
  setSync('loading');
  const { error } = await db.from('forecast_settings').upsert({ id: 1, data: state.forecast, updated_by: userId, updated_at: new Date().toISOString() });
  if (error) return handleError(error);
  $('#forecastSaveState').textContent = 'Enregistré et partagé';
  $('#forecastSaveState').classList.remove('dirty');
  setSync('ok'); toast('Prévisionnel enregistré pour Maxime et Paul.');
}

function handleError(error, friendly = '') {
  console.error(error); setSync('error'); toast(friendly || error.message || 'Une erreur est survenue.', true);
}

function generatePdf(doc) {
  if (!window.jspdf?.jsPDF) return toast('Le module PDF ne répond pas.', true);
  const { jsPDF } = window.jspdf, pdf = new jsPDF({ unit: 'mm', format: 'a4', compress: true });
  const company = state.settings || {}, contact = doc.contact || state.contacts.find(item => item.id === doc.contact_id) || {}, lines = doc.lines || [], W = 210, H = 297, left = 15, right = 195, bottom = 268;
  const colors = { dark: [9, 24, 39], text: [23, 32, 51], muted: [105, 115, 134], line: [224, 229, 236], soft: [247, 249, 251], gold: [184, 145, 70] };
  const text = (value, x, y, size = 8, style = 'normal', color = colors.text, opts = {}) => { pdf.setFont('helvetica', style); pdf.setFontSize(size); pdf.setTextColor(...color); pdf.text(String(value ?? ''), x, y, opts); };
  const wrap = (value, x, y, width, size = 8, lineHeight = 4) => { pdf.setFont('helvetica', 'normal'); pdf.setFontSize(size); pdf.setTextColor(...colors.text); const rows = pdf.splitTextToSize(String(value || '—'), width); pdf.text(rows, x, y); return y + rows.length * lineHeight; };
  const money = value => `${num(value).toFixed(2).replace('.', ',').replace(/\B(?=(\d{3})+(?!\d))/g, ' ')} €`;
  const header = () => { pdf.setFillColor(...colors.dark); pdf.roundedRect(12, 10, 186, 29, 4, 4, 'F'); text('FASTE', 20, 23, 20, 'bold', [255, 255, 255]); text('Production événementielle · DJ · Son · Lumière', 20, 31, 8, 'normal', [215, 225, 236]); text(doc.type === 'devis' ? 'DEVIS' : 'FACTURE', 190, 23, 16, 'bold', [255, 255, 255], { align: 'right' }); text(doc.number, 190, 31, 9, 'normal', [255, 255, 255], { align: 'right' }); };
  const footer = page => { pdf.setDrawColor(...colors.line); pdf.line(left, H - 18, right, H - 18); const legal = [company.company_name || 'FASTE', company.siret ? `SIRET ${company.siret}` : '', company.vat_number ? `TVA ${company.vat_number}` : ''].filter(Boolean).join(' · '); text(legal, left, H - 11, 6.2, 'normal', colors.muted, { maxWidth: 155 }); text(`Page ${page}`, right, H - 11, 6.2, 'normal', colors.muted, { align: 'right' }); };
  const nextPage = () => { pdf.addPage(); header(); return 50; };
  header(); let y = 51;
  pdf.setFillColor(...colors.soft); pdf.roundedRect(left, y, 86, 42, 3, 3, 'F'); pdf.roundedRect(109, y, 86, 42, 3, 3, 'F');
  text('ÉMETTEUR', 21, y + 8, 7, 'bold', colors.muted); text(company.company_name || 'FASTE', 21, y + 17, 10, 'bold'); let cy = y + 23; cy = wrap([company.address, [company.postal_code, company.city].filter(Boolean).join(' ')].filter(Boolean).join('\n'), 21, cy, 70, 7.2, 3.7); if (company.email || company.phone) wrap([company.email, company.phone].filter(Boolean).join(' · '), 21, cy, 70, 6.8, 3.5);
  text('CLIENT', 115, y + 8, 7, 'bold', colors.muted); text(contact.name || 'Client à préciser', 115, y + 17, 10, 'bold'); let py = y + 23; py = wrap([contact.address, [contact.postal_code, contact.city].filter(Boolean).join(' ')].filter(Boolean).join('\n'), 115, py, 70, 7.2, 3.7); if (contact.email || contact.phone) wrap([contact.email, contact.phone].filter(Boolean).join(' · '), 115, py, 70, 6.8, 3.5);
  y += 51; text(`Date : ${dateFr(doc.document_date)}`, left, y, 8); if (doc.type === 'facture' && doc.due_date) text(`Échéance : ${dateFr(doc.due_date)}`, right, y, 8, 'normal', colors.text, { align: 'right' }); y += 8;
  if (doc.event_type || doc.event_date || doc.venue) { pdf.setFillColor(250, 247, 240); pdf.roundedRect(left, y, 180, 16, 3, 3, 'F'); text([doc.event_type, doc.event_date ? dateFr(doc.event_date) : '', doc.venue].filter(Boolean).join(' · '), 21, y + 10, 8, 'normal', colors.text, { maxWidth: 168 }); y += 23; }
  const drawTableHead = () => { pdf.setFillColor(...colors.dark); pdf.roundedRect(left, y, 180, 10, 2, 2, 'F'); text('PRESTATION', 21, y + 6.5, 7, 'bold', [255, 255, 255]); text('QTÉ', 125, y + 6.5, 7, 'bold', [255, 255, 255], { align: 'right' }); text('PU HT', 158, y + 6.5, 7, 'bold', [255, 255, 255], { align: 'right' }); text('TVA', 176, y + 6.5, 7, 'bold', [255, 255, 255], { align: 'right' }); text('TOTAL TTC', 193, y + 6.5, 7, 'bold', [255, 255, 255], { align: 'right' }); y += 16; };
  drawTableHead();
  lines.forEach((line, index) => { const desc = pdf.splitTextToSize(line.description || 'Prestation', 91), height = Math.max(10, desc.length * 4 + 5); if (y + height > bottom) { y = nextPage(); drawTableHead(); } if (index % 2 === 0) { pdf.setFillColor(...colors.soft); pdf.rect(left, y - 5, 180, height, 'F'); } text(desc, 21, y, 8); text(num(line.quantity), 125, y, 8, 'normal', colors.text, { align: 'right' }); text(money(line.unit_price_ht), 158, y, 8, 'normal', colors.text, { align: 'right' }); text(`${num(line.vat_rate)} %`, 176, y, 8, 'normal', colors.text, { align: 'right' }); text(money(line.line_total_ttc ?? (num(line.quantity) * num(line.unit_price_ht) * (1 + num(line.vat_rate) / 100))), 193, y, 8, 'normal', colors.text, { align: 'right' }); pdf.setDrawColor(...colors.line); pdf.line(left, y + height - 5, right, y + height - 5); y += height; });
  if (y + 58 > bottom) y = nextPage(); y += 9; pdf.setFillColor(...colors.soft); pdf.roundedRect(113, y, 82, doc.type === 'facture' ? 52 : 40, 3, 3, 'F'); text('Total HT', 121, y + 10, 8, 'normal', colors.muted); text(money(doc.total_ht), 188, y + 10, 8, 'bold', colors.text, { align: 'right' }); text('TVA', 121, y + 19, 8, 'normal', colors.muted); text(money(doc.total_vat), 188, y + 19, 8, 'bold', colors.text, { align: 'right' }); pdf.setDrawColor(...colors.line); pdf.line(121, y + 24, 188, y + 24); text('TOTAL TTC', 121, y + 35, 10, 'bold'); text(money(doc.total_ttc), 188, y + 35, 10, 'bold', colors.text, { align: 'right' }); if (doc.type === 'facture') { text('Déjà encaissé', 121, y + 43, 7, 'normal', colors.muted); text(money(doc.paid_amount), 188, y + 43, 7, 'normal', colors.text, { align: 'right' }); text('Reste à payer', 121, y + 49, 7.5, 'bold'); text(money(doc.remaining_amount), 188, y + 49, 7.5, 'bold', colors.text, { align: 'right' }); } y += doc.type === 'facture' ? 62 : 50;
  if (doc.notes) { const noteRows = pdf.splitTextToSize(doc.notes, 168), h = Math.max(18, noteRows.length * 4 + 10); if (y + h > bottom) y = nextPage(); text('NOTES & CONDITIONS', left, y, 8, 'bold'); y += 6; pdf.setFillColor(...colors.soft); pdf.roundedRect(left, y, 180, h, 3, 3, 'F'); text(noteRows, 21, y + 7, 8); y += h + 8; }
  if (company.iban) { if (y + 14 > bottom) y = nextPage(); text(`IBAN : ${company.iban}${company.bic ? ` · BIC : ${company.bic}` : ''}`, left, y, 7.2, 'normal', colors.muted); }
  for (let page = 1; page <= pdf.getNumberOfPages(); page++) { pdf.setPage(page); footer(page); }
  pdf.save(`${doc.number || 'FASTE-document'}.pdf`);
}

function navigate(page) {
  const target = pageMeta[page] ? page : 'dashboard';
  $$('.page').forEach(section => section.classList.toggle('active', section.id === `page-${target}`));
  $$('.nav-link[data-page]').forEach(button => button.classList.toggle('active', button.dataset.page === target));
  $('#pageTitle').textContent = pageMeta[target][0]; $('#pageSubtitle').textContent = pageMeta[target][1];
  $('#sidebar').classList.remove('open'); if (location.hash !== `#${target}`) history.replaceState(null, '', `#${target}`);
}

function bindEvents() {
  $$('.nav-link[data-page]').forEach(button => button.addEventListener('click', () => navigate(button.dataset.page)));
  $('#logoutBtn').addEventListener('click', () => fasteAuth.logout()); $('#refreshBtn').addEventListener('click', () => loadData()); $('#menuBtn').addEventListener('click', () => $('#sidebar').classList.toggle('open'));
  $$('[data-close]').forEach(button => button.addEventListener('click', () => closeModal(button.dataset.close)));
  $$('.modal').forEach(modal => modal.addEventListener('mousedown', event => { if (event.target === modal) closeModal(modal.id); }));
  document.addEventListener('keydown', event => { if (event.key === 'Escape') { const modal = document.querySelector('.modal.open'); if (modal) closeModal(modal.id); } });
  document.addEventListener('click', event => {
    const action = event.target.closest('[data-action]')?.dataset.action;
    if (action === 'new-contact') openContact(); if (action === 'new-document') openDocument(); if (action === 'new-service') openService(); if (action === 'new-material') openMaterial();
    const contact = event.target.closest('[data-edit-contact]')?.dataset.editContact; if (contact) openContact(contact);
    const service = event.target.closest('[data-edit-service]')?.dataset.editService; if (service) openService(service);
    const material = event.target.closest('[data-edit-material]')?.dataset.editMaterial; if (material) openMaterial(material);
    const eventId = event.target.closest('[data-edit-event]')?.dataset.editEvent; if (eventId) openEvent(eventId);
    const documentId = event.target.closest('[data-edit-document]')?.dataset.editDocument || event.target.closest('[data-document]')?.dataset.document; if (documentId) openDocument(documentId);
    const pdfId = event.target.closest('[data-pdf-document]')?.dataset.pdfDocument; if (pdfId) { const doc = state.documents.find(item => item.id === pdfId); if (doc) generatePdf(doc); }
    const go = event.target.closest('[data-go]')?.dataset.go; if (go) navigate(go);
    const serviceId = event.target.closest('[data-add-service]')?.dataset.addService; if (serviceId) { const item = state.services.find(service => service.id === serviceId); if (item) addDocumentLine(item); closeModal('catalogModal'); }
  });
  $('#crmFilters').addEventListener('click', event => { const button = event.target.closest('button[data-filter]'); if (!button) return; $$('#crmFilters button').forEach(item => item.classList.toggle('active', item === button)); state.crmFilter = button.dataset.filter; renderContacts(); });
  $('#docFilters').addEventListener('click', event => { const button = event.target.closest('button[data-filter]'); if (!button) return; $$('#docFilters button').forEach(item => item.classList.toggle('active', item === button)); state.docFilter = button.dataset.filter; renderDocuments(); });
  $('#eventFilters').addEventListener('click', event => { const button = event.target.closest('button[data-filter]'); if (!button) return; $$('#eventFilters button').forEach(item => item.classList.toggle('active', item === button)); state.eventFilter = button.dataset.filter; renderEvents(); });
  $('#contactSearch').addEventListener('input', renderContacts); $('#documentSearch').addEventListener('input', renderDocuments); $('#eventSearch').addEventListener('input', renderEvents);
  $('#contactForm').addEventListener('submit', saveContact); $('#deleteContactBtn').addEventListener('click', deleteContact);
  $('#serviceForm').addEventListener('submit', saveService); $('#deleteServiceBtn').addEventListener('click', disableService);
  $('#materialForm').addEventListener('submit', saveMaterial); $('#deleteMaterialBtn').addEventListener('click', deleteMaterial);
  $('#documentForm').addEventListener('submit', saveDocument); $('#deleteDocumentBtn').addEventListener('click', deleteDocument); $('#convertDocumentBtn').addEventListener('click', convertDocument); $('#pdfDocumentBtn').addEventListener('click', () => { const doc = state.documents.find(item => item.id === state.editingDocument); if (doc) generatePdf(doc); });
  $('#eventForm').addEventListener('submit', saveEvent); $('#addTaskBtn').addEventListener('click', () => addEventTask());
  $('#catalogBtn').addEventListener('click', openCatalog); $('#freeLineBtn').addEventListener('click', () => addDocumentLine()); $('#settingsForm').addEventListener('submit', saveSettings);
  $('#saveForecastBtn').addEventListener('click', saveForecast);
  $('#addForecastExpenseBtn').addEventListener('click', addForecastExpense);
  $('#addForecastInvestmentBtn').addEventListener('click', addForecastInvestment);
  $('#forecastScenarios').addEventListener('click', event => { const button = event.target.closest('button[data-scenario]'); if (!button || button.dataset.scenario === state.forecastScenario) return; readForecastInputs(); state.forecastScenario = button.dataset.scenario; state.forecast.activeScenario = state.forecastScenario; renderForecast(); markForecastDirty(); });
  $('#forecastChartMode').addEventListener('click', event => { const button = event.target.closest('button[data-mode]'); if (!button) return; state.forecastChartMode = button.dataset.mode; $$('#forecastChartMode button').forEach(item => item.classList.toggle('active', item === button)); calculateForecast(); });
  $('#page-strategy').addEventListener('input', event => { if (!event.target.matches('input,select')) return; calculateForecast(); markForecastDirty(); });
  $('#page-strategy').addEventListener('change', event => { if (!event.target.matches('input,select')) return; calculateForecast(); markForecastDirty(); });
  $('#page-strategy').addEventListener('click', event => { const remove = event.target.closest('[data-remove-forecast-line]'); if (!remove) return; readForecastInputs(); const expenseRow = remove.closest('[data-forecast-expense]'), investmentRow = remove.closest('[data-forecast-investment]'); if (expenseRow) { activeForecast().expenses = activeForecast().expenses.filter(item => item.id !== expenseRow.dataset.forecastExpense); renderForecastExpenses(); } if (investmentRow) { activeForecast().investments = activeForecast().investments.filter(item => item.id !== investmentRow.dataset.forecastInvestment); renderForecastInvestments(); } markForecastDirty(); calculateForecast(); });
  window.addEventListener('hashchange', () => navigate(location.hash.slice(1))); document.addEventListener('visibilitychange', () => { if (!document.hidden) loadData({ quiet: true }); });
}

async function init() {
  const session = await fasteAuth.requireSession(); if (!session) return;
  $('#userEmail').textContent = session.user.email || '';
  fasteAuth.client.auth.onAuthStateChange((event, activeSession) => { if (event === 'SIGNED_OUT' || !activeSession) location.replace('faste-login.html'); });
  bindEvents(); navigate(location.hash.slice(1) || 'dashboard'); await loadData(); setInterval(() => loadData({ quiet: true }), 60000);
}

init().catch(error => handleError(error));
