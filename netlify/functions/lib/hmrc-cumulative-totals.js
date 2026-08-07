// Shared aggregation used by both hmrc-submission-preview.js (read-only) and
// hmrc-submit-cumulative.js (the real submission) -- a real CommonJS module,
// safe to share since both callers are Netlify Functions (unlike the
// server/browser split needed for hmrc-category-map.js's display mirror).

const {CATEGORY_MAP, HMRC_EXPENSE_FIELDS} = require('./hmrc-category-map');

const SUPABASE_URL = 'https://srmcrwqvqsrjpkrymkth.supabase.co';

function serviceHeaders() {
  const service = process.env.SUPABASE_SERVICE_ROLE_KEY;
  return {apikey: service, Authorization: 'Bearer ' + service};
}

// Kept byte-identical in spirit to assets/app.js's taxStart() -- the current
// UK tax year always starts 6 April. Re-implemented here since Netlify
// Functions can't require() a browser-global script in this un-bundled repo.
function taxStart(ds) {
  const d = new Date(ds + 'T12:00:00');
  const y = d.getFullYear();
  return new Date(d >= new Date(y, 3, 6, 12) ? y : y - 1, 3, 6, 12).toISOString().slice(0, 10);
}

function today() {
  return new Date().toISOString().slice(0, 10);
}

// HMRC's own tax-year string format, e.g. "2026-27" for the year starting
// 6 April 2026.
function taxYearLabel(startDate) {
  const y = new Date(startDate + 'T12:00:00').getFullYear();
  return `${y}-${String((y + 1) % 100).padStart(2, '0')}`;
}

async function computeCumulativeTotals(userId, periodStart, periodEnd) {
  const headers = serviceHeaders();

  const [takingsRes, expensesRes] = await Promise.all([
    fetch(`${SUPABASE_URL}/rest/v1/daily_takings?user_id=eq.${encodeURIComponent(userId)}&work_date=gte.${periodStart}&work_date=lte.${periodEnd}&select=gross_takings,work_date`, {headers}),
    fetch(`${SUPABASE_URL}/rest/v1/expenses?user_id=eq.${encodeURIComponent(userId)}&expense_date=gte.${periodStart}&expense_date=lte.${periodEnd}&select=category,amount,actual_cost_amount,tax_treatment,expense_date`, {headers})
  ]);
  if (!takingsRes.ok) throw new Error(`Could not read takings (${takingsRes.status}).`);
  if (!expensesRes.ok) throw new Error(`Could not read expenses (${expensesRes.status}).`);

  const takings = await takingsRes.json();
  const expenses = await expensesRes.json();

  const turnover = takings.reduce((s, x) => s + Number(x.gross_takings || 0), 0);

  const expensesByHmrcField = {};
  HMRC_EXPENSE_FIELDS.forEach(f => {
    expensesByHmrcField[f] = 0;
    expensesByHmrcField[f + 'Disallowable'] = 0;
  });

  expenses.forEach(x => {
    const hmrcField = CATEGORY_MAP[x.category] || 'otherExpenses';
    const amount = Number(x.actual_cost_amount ?? x.amount ?? 0);
    const key = x.tax_treatment === 'non_allowable' ? hmrcField + 'Disallowable' : hmrcField;
    expensesByHmrcField[key] = (expensesByHmrcField[key] || 0) + amount;
  });

  // Round every figure to 2dp -- HMRC's API rejects sub-penny values.
  Object.keys(expensesByHmrcField).forEach(k => {
    expensesByHmrcField[k] = Math.round(expensesByHmrcField[k] * 100) / 100;
  });

  return {
    taxYear: taxYearLabel(periodStart),
    periodStart,
    periodEnd,
    turnover: Math.round(turnover * 100) / 100,
    expensesByHmrcField,
    sourceRowCounts: {takings: takings.length, expenses: expenses.length}
  };
}

module.exports = {computeCumulativeTotals, taxStart, today, taxYearLabel};
