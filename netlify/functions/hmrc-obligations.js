const {getValidAccessToken} = require('./lib/hmrc-token');
const {buildFraudPreventionHeaders, API_BASE} = require('./lib/hmrc');

const SUPABASE_URL = 'https://srmcrwqvqsrjpkrymkth.supabase.co';
const SUPABASE_KEY = 'sb_publishable__RUy-86OViF_dqqEACwcBw_U8IgWk77';

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

    const profRes = await fetch(`${SUPABASE_URL}/rest/v1/profiles?id=eq.${encodeURIComponent(user.id)}&select=national_insurance_number`, {headers: svcHeaders});
    const nino = (await profRes.json())[0]?.national_insurance_number;
    if (!nino) return {statusCode: 400, body: JSON.stringify({error: 'Add your National Insurance number on the Account page first.'})};

    let accessToken;
    try {
      accessToken = await getValidAccessToken(user.id);
    } catch (e) {
      return {statusCode: 409, body: JSON.stringify({error: e.message})};
    }

    const body = JSON.parse(event.body || '{}');
    const fpHeaders = await buildFraudPreventionHeaders(body.signals || {}, event, user.id);

    const r = await fetch(
      `${API_BASE}/obligations/details/${encodeURIComponent(nino)}/income-and-expenditure?typeOfBusiness=self-employment`,
      {headers: {Authorization: 'Bearer ' + accessToken, Accept: 'application/vnd.hmrc.3.0+json', ...fpHeaders}}
    );
    const data = await r.json().catch(() => ({}));
    if (!r.ok) {
      return {statusCode: r.status, headers: {'Content-Type': 'application/json'}, body: JSON.stringify({error: data?.message || 'HMRC could not return your obligations.'})};
    }

    // HMRC nests the actual period/date fields one level deeper than you'd
    // expect: obligations[] is one entry per business, each holding an
    // obligationDetails[] array with the real periodStartDate/periodEndDate/
    // dueDate/status/receivedDate (confirmed against HMRC's Obligations API
    // 3.0 spec, not assumed) -- flatten here so the client can stay simple.
    const flattened = [];
    for (const biz of (data.obligations || [])) {
      for (const d of (biz.obligationDetails || [])) {
        flattened.push({
          businessId: biz.businessId,
          typeOfBusiness: biz.typeOfBusiness,
          periodStartDate: d.periodStartDate,
          periodEndDate: d.periodEndDate,
          dueDate: d.dueDate,
          status: d.status,
          receivedDate: d.receivedDate || null
        });
      }
    }

    return {
      statusCode: 200,
      headers: {'Content-Type': 'application/json', 'Cache-Control': 'no-store'},
      body: JSON.stringify({obligations: flattened})
    };
  } catch (err) {
    console.error('hmrc-obligations error:', err);
    return {statusCode: 500, headers: {'Content-Type': 'application/json'}, body: JSON.stringify({error: err.message || 'Could not load obligations.'})};
  }
};
