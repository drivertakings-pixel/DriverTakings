// The only function in this repo that sends real income/expense figures to
// HMRC. Only ever called from the "Confirm and submit to HMRC" button on
// the review screen in app/mtd/index.html -- no cron, no scheduler, nothing
// automatic. Always recomputes totals server-side from live data at submit
// time; never trusts client-supplied numbers, only the confirm gesture and
// the target period dates. Writes an audit row to hmrc_submissions
// regardless of whether HMRC accepts or rejects the submission.

const {getValidAccessToken} = require('./lib/hmrc-token');
const {buildFraudPreventionHeaders, API_BASE} = require('./lib/hmrc');
const {computeCumulativeTotals, taxStart, today} = require('./lib/hmrc-cumulative-totals');

const SUPABASE_URL = 'https://srmcrwqvqsrjpkrymkth.supabase.co';
const SUPABASE_KEY = 'sb_publishable__RUy-86OViF_dqqEACwcBw_U8IgWk77';

function serviceHeaders() {
  const service = process.env.SUPABASE_SERVICE_ROLE_KEY;
  return {apikey: service, Authorization: 'Bearer ' + service, 'Content-Type': 'application/json'};
}

async function recordSubmission(userId, businessId, totals, payload, hmrcStatus, hmrcResponse) {
  const headers = serviceHeaders();
  await fetch(`${SUPABASE_URL}/rest/v1/hmrc_submissions`, {
    method: 'POST',
    headers,
    body: JSON.stringify({
      user_id: userId,
      business_id: businessId,
      tax_year: totals.taxYear,
      period_start: totals.periodStart,
      period_end: totals.periodEnd,
      payload,
      hmrc_status: hmrcStatus,
      hmrc_response: hmrcResponse
    })
  }).catch(err => console.error('hmrc-submit-cumulative: failed to write audit row:', err));
}

exports.handler = async (event) => {
  if (event.httpMethod !== 'POST') return {statusCode: 405, body: JSON.stringify({error: 'Method not allowed'})};
  try {
    const auth = event.headers.authorization || event.headers.Authorization || '';
    if (!auth.startsWith('Bearer ')) return {statusCode: 401, body: JSON.stringify({error: 'Please log in.'})};
    const token = auth.slice(7);
    const u = await fetch(SUPABASE_URL + '/auth/v1/user', {headers: {apikey: SUPABASE_KEY, Authorization: 'Bearer ' + token}});
    if (!u.ok) return {statusCode: 401, body: JSON.stringify({error: 'Your login session could not be verified.'})};
    const user = await u.json();

    const service = process.env.SUPABASE_SERVICE_ROLE_KEY;
    if (!service) return {statusCode: 500, body: JSON.stringify({error: 'SUPABASE_SERVICE_ROLE_KEY is not configured.'})};
    const svcHeaders = {apikey: service, Authorization: 'Bearer ' + service};

    const body = JSON.parse(event.body || '{}');
    if (!body.confirm) return {statusCode: 400, body: JSON.stringify({error: 'Submission was not confirmed.'})};

    const [profRes, connRes] = await Promise.all([
      fetch(`${SUPABASE_URL}/rest/v1/profiles?id=eq.${encodeURIComponent(user.id)}&select=national_insurance_number`, {headers: svcHeaders}),
      fetch(`${SUPABASE_URL}/rest/v1/hmrc_connections?user_id=eq.${encodeURIComponent(user.id)}&select=hmrc_business_id`, {headers: svcHeaders})
    ]);
    const nino = (await profRes.json())[0]?.national_insurance_number;
    const businessId = (await connRes.json())[0]?.hmrc_business_id;
    if (!nino) return {statusCode: 400, body: JSON.stringify({error: 'Add your National Insurance number on the Account page first.'})};
    if (!businessId) return {statusCode: 400, body: JSON.stringify({error: 'Connect your HMRC account first.'})};

    let accessToken;
    try {
      accessToken = await getValidAccessToken(user.id);
    } catch (e) {
      return {statusCode: 409, body: JSON.stringify({error: e.message})};
    }

    // Always recompute from live data -- never trust body.turnover etc,
    // only the target period dates (defaulting to the current tax year).
    const todayStr = today();
    const periodStart = body.periodStart || taxStart(todayStr);
    const periodEnd = body.periodEnd || todayStr;
    const totals = await computeCumulativeTotals(user.id, periodStart, periodEnd);

    // HMRC's real request body nests everything under periodDates/
    // periodIncome/periodExpenses/periodDisallowableExpenses (confirmed
    // against the schema in hmrc/self-employment-business-api's own repo,
    // not assumed) -- a flat top-level body is exactly what produces
    // "An empty or non-matching body was submitted". Zero-value categories
    // are omitted rather than sent as 0, matching the review screen's own
    // filtering and each object's optional-field semantics.
    const periodExpenses = {};
    const periodDisallowableExpenses = {};
    for (const [key, value] of Object.entries(totals.expensesByHmrcField)) {
      if (!value) continue;
      if (key.endsWith('Disallowable')) periodDisallowableExpenses[key] = value;
      else periodExpenses[key] = value;
    }

    const payload = {
      periodDates: {
        periodStartDate: totals.periodStart,
        periodEndDate: totals.periodEnd
      },
      periodIncome: {
        turnover: totals.turnover
      },
      ...(Object.keys(periodExpenses).length ? {periodExpenses} : {}),
      ...(Object.keys(periodDisallowableExpenses).length ? {periodDisallowableExpenses} : {})
    };

    const fpHeaders = await buildFraudPreventionHeaders(body.signals || {}, event, user.id);

    const r = await fetch(
      `${API_BASE}/individuals/business/self-employment/${encodeURIComponent(nino)}/${encodeURIComponent(businessId)}/cumulative/${encodeURIComponent(totals.taxYear)}`,
      {
        method: 'PUT',
        headers: {Authorization: 'Bearer ' + accessToken, Accept: 'application/vnd.hmrc.5.0+json', 'Content-Type': 'application/json', ...fpHeaders},
        body: JSON.stringify(payload)
      }
    );
    const hmrcResponse = await r.json().catch(() => ({}));

    await recordSubmission(user.id, businessId, totals, payload, r.status, hmrcResponse);

    return {
      statusCode: 200,
      headers: {'Content-Type': 'application/json', 'Cache-Control': 'no-store'},
      body: JSON.stringify({ok: r.ok, hmrcStatus: r.status, hmrcResponse, totals})
    };
  } catch (err) {
    console.error('hmrc-submit-cumulative error:', err);
    return {statusCode: 500, headers: {'Content-Type': 'application/json'}, body: JSON.stringify({error: err.message || 'Could not submit to HMRC.'})};
  }
};
