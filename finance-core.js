/* Calculs purs du suivi réel FASTE — montants en centimes pour les additions. */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.FasteFinance = factory();
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';
  const cents = value => Math.round(Number(value || 0) * 100);
  const money = value => Math.round(value) / 100;
  const sum = (list, fn) => money(list.reduce((s, x) => s + cents(fn(x)), 0));
  const active = p => !p.cancelled;
  const paidExpense = (expense, payments, asOf) => sum(payments.filter(p => active(p) && p.expense_id === expense.id && (!asOf || p.payment_date <= asOf)), p => p.amount);
  const expenseTtc = e => money(cents(e.amount_ht) + cents(e.amount_vat));
  const cost = e => e.kind !== 'charge' ? 0 : money(cents(expenseTtc(e)) - (e.deduction_status === 'yes' ? cents(e.deductible_vat) : 0));
  const docPaid = (doc, payments, asOf) => money(cents(doc.finance_initial_paid ?? doc.paid_amount) + payments.filter(p => active(p) && p.document_id === doc.id && (!asOf || p.payment_date <= asOf)).reduce((s, p) => s + cents(p.amount), 0));
  const remainingDoc = (d, payments, asOf) => Math.max(0, money(cents(d.total_ttc) - cents(docPaid(d, payments, asOf))));
  function eventRows({ events, documents, expenses, payments }, asOf) {
    const invoices = documents.filter(d => d.type === 'facture');
    const rows = events.map(e => ({ id: e.id, title: e.title, date: e.event_date, quote: documents.find(d => d.id === e.source_quote_id), docs: invoices.filter(d => d.source_quote_id === e.source_quote_id), expenses: expenses.filter(x => !x.archived && x.event_id === e.id) }));
    invoices.filter(d => !events.some(e => e.source_quote_id === d.source_quote_id && d.source_quote_id)).forEach(d => rows.push({ id: 'document:' + d.id, title: d.event_type || d.number, date: d.event_date, quote: null, docs: [d], expenses: expenses.filter(x => !x.archived && x.document_id === d.id) }));
    return rows.map(r => {
      const billed = sum(r.docs.filter(d => !asOf || d.document_date <= asOf), d => d.total_ht);
      const costs = sum(r.expenses.filter(e => !asOf || e.document_date <= asOf), cost);
      const margin = money(cents(billed) - cents(costs));
      return { ...r, billed, costs, margin, rate: billed > 0 ? margin / billed * 100 : null, received: sum(r.docs.filter(d => !asOf || d.document_date <= asOf), d => docPaid(d, payments, asOf)), due: sum(r.docs.filter(d => !asOf || d.document_date <= asOf), d => remainingDoc(d, payments, asOf)), payable: sum(r.expenses.filter(e => !asOf || e.document_date <= asOf), e => Math.max(0, expenseTtc(e) - paidExpense(e, payments, asOf))), pendingVat: r.expenses.some(e => e.kind === 'charge' && e.deduction_status === 'unknown') };
    });
  }
  function snapshot(data, asOf) {
    const { documents, events, expenses, payments, flows, settings } = data;
    const invoices = documents.filter(d => d.type === 'facture' && d.document_date <= asOf);
    const purchases = expenses.filter(e => !e.archived && e.document_date <= asOf);
    const due = sum(invoices, d => remainingDoc(d, payments, asOf));
    const payable = sum(purchases, e => Math.max(0, expenseTtc(e) - paidExpense(e, payments, asOf)));
    const isAdvance = d => {
      const event = events.find(e => d.source_quote_id && e.source_quote_id === d.source_quote_id);
      return event ? event.status !== 'completed' && (!event.event_date || event.event_date > asOf) : !d.event_date || d.event_date > asOf;
    };
    const clientAdvances = sum(invoices.filter(isAdvance), d => docPaid(d, payments, asOf));
    const supplierAdvances = sum(purchases.filter(e => e.kind === 'advance'), e => paidExpense(e, payments, asOf));
    // Estimation opérationnelle : les factures futures non réalisées sont exclues des créances BFR.
    const bfrReceivables = sum(invoices.filter(d => !isAdvance(d)), d => remainingDoc(d, payments, asOf));
    const bfrPayables = sum(purchases.filter(e => e.kind === 'charge'), e => Math.max(0, expenseTtc(e) - paidExpense(e, payments, asOf)));
    const bfr = money(cents(bfrReceivables) + cents(supplierAdvances) - cents(bfrPayables) - cents(clientAdvances));
    let cash = null;
    if (settings.balance_date && settings.balance_amount != null && settings.balance_date <= asOf) {
      cash = money(cents(settings.balance_amount) + payments.filter(p => active(p) && p.payer === 'bank' && p.payment_date > settings.balance_date && p.payment_date <= asOf).reduce((s, p) => s + cents(p.amount) * (p.document_id ? 1 : -1), 0) + flows.filter(f => !f.cancelled && f.realized && f.flow_date > settings.balance_date && f.flow_date <= asOf).reduce((s, f) => s + cents(f.amount), 0));
    }
    const personal = ['Paul', 'Maxime'].map(name => ({ name, amount: money(payments.filter(p => active(p) && p.payer === name && p.payment_date <= asOf).reduce((s, p) => s + cents(p.amount), 0) - flows.filter(f => !f.cancelled && f.realized && f.beneficiary === name && f.category === 'reimbursement' && f.flow_date <= asOf).reduce((s, f) => s + Math.abs(cents(f.amount)), 0)) }));
    return { due, payable, cash, bfr, bfrReceivables, bfrPayables, clientAdvances, supplierAdvances, personal, billed: sum(invoices, d => d.total_ht), costs: sum(purchases, cost), pendingVat: purchases.filter(e => e.deduction_status === 'unknown' && e.kind === 'charge').length };
  }
  function forecast(data, asOf, months = 6) {
    const snap = snapshot(data, asOf), scheduled = [], overdue = [];
    data.documents.filter(d => d.type === 'facture' && d.document_date <= asOf).forEach(d => {
      const amount = remainingDoc(d, data.payments, asOf); if (amount) (d.due_date && d.due_date > asOf ? scheduled : overdue).push({ date: d.due_date, amount, label: d.number });
    });
    data.expenses.filter(e => !e.archived && e.document_date <= asOf).forEach(e => {
      const amount = Math.max(0, expenseTtc(e) - paidExpense(e, data.payments, asOf)); if (amount) (e.due_date && e.due_date > asOf ? scheduled : overdue).push({ date: e.due_date, amount: -amount, label: e.supplier });
    });
    data.flows.filter(f => !f.cancelled && !f.realized).forEach(f => (f.flow_date > asOf ? scheduled : overdue).push({ date: f.flow_date, amount: Number(f.amount), label: f.label }));
    let balance = snap.cash;
    const rows = [];
    for (let i = 0; i < months; i++) {
      const date = new Date(asOf + 'T12:00:00Z'); date.setUTCDate(1); date.setUTCMonth(date.getUTCMonth() + i);
      const month = date.toISOString().slice(0, 7); const entries = scheduled.filter(x => x.date?.startsWith(month));
      const incoming = sum(entries.filter(x => x.amount > 0), x => x.amount), outgoing = -sum(entries.filter(x => x.amount < 0), x => x.amount);
      if (balance != null) balance = money(cents(balance) + cents(incoming) - cents(outgoing));
      rows.push({ month, incoming, outgoing, balance });
    }
    return { rows, overdue: overdue.filter(x => Math.abs(x.amount) > 0.005) };
  }
  function csv(rows) {
    const cell = x => '"' + String(x ?? '').replace(/^[\s]*[=+@-]/, "'$&").replace(/"/g, '""') + '"';
    return '\uFEFF' + rows.map(r => r.map(cell).join(';')).join('\r\n');
  }
  return { cents, money, sum, expenseTtc, cost, paidExpense, docPaid, remainingDoc, eventRows, snapshot, forecast, csv };
});
