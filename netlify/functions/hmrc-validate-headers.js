const {getApplicationToken, buildFraudPreventionHeaders, API_BASE} = require('./lib/hmrc');

const SUPABASE_URL = 'https://srmcrwqvqsrjpkrymkth.supabase.co';
const SUPABASE_KEY = 'sb_publishable__RUy-86OViF_dqqEACwcBw_U8IgWk77';

// Dev/testing helper, not part of the live connect flow: proves the exact
// header-assembly code path in lib/hmrc.js is compliant with HMRC's Fraud
// Prevention Header spec, using HMRC's own Test Fraud Prevention Headers
// validator (application-restricted -- no user consent needed for this
// specific check). Called manually during verification, not from any page.
exports.handler = async (event) => {
  if (event.httpMethod !== 'POST') return {statusCode: 405, body: JSON.stringify({error: 'Method not allowed'})};
  try {
    const auth = event.headers.authorization || event.headers.Authorization || '';
    if (!auth.startsWith('Bearer ')) return {statusCode: 401, body: JSON.stringify({error: 'Please log in.'})};
    const token = auth.slice(7);
    const u = await fetch(SUPABASE_URL + '/auth/v1/user', {headers: {apikey: SUPABASE_KEY, Authorization: 'Bearer ' + token}});
    if (!u.ok) return {statusCode: 401, body: JSON.stringify({error: 'Your login session could not be verified.'})};
    const user = await u.json();

    const body = JSON.parse(event.body || '{}');
    const signals = body.signals || {};

    const fpHeaders = await buildFraudPreventionHeaders(signals, event, user.id);
    const appToken = await getApplicationToken();

    const r = await fetch(`${API_BASE}/test/fraud-prevention-headers/validate`, {
      method: 'GET',
      headers: {
        Authorization: 'Bearer ' + appToken,
        Accept: 'application/vnd.hmrc.1.0+json',
        ...fpHeaders
      }
    });
    const result = await r.json().catch(() => ({}));

    return {
      statusCode: 200,
      headers: {'Content-Type': 'application/json', 'Cache-Control': 'no-store'},
      body: JSON.stringify({hmrcStatus: r.status, headersSent: fpHeaders, result})
    };
  } catch (err) {
    console.error('hmrc-validate-headers error:', err);
    return {statusCode: 500, headers: {'Content-Type': 'application/json'}, body: JSON.stringify({error: err.message || 'Could not validate fraud-prevention headers.'})};
  }
};
