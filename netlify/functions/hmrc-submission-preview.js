// No HMRC call, no side effects -- safe to call as often as the driver
// reloads the review screen. Returns the exact numbers a submission would
// contain, computed fresh from live daily_takings/expenses each time.

const {computeCumulativeTotals, taxStart, today} = require('./lib/hmrc-cumulative-totals');

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

    // Check the driver actually has an HMRC business connected -- the
    // preview is still meaningful without it (they can see their figures),
    // but flag it so the UI can disable "Confirm and submit" until connected.
    const connRes = await fetch(
      `${SUPABASE_URL}/rest/v1/hmrc_connections?user_id=eq.${encodeURIComponent(user.id)}&select=hmrc_business_id`,
      {headers: {apikey: service, Authorization: 'Bearer ' + service}}
    );
    const businessId = (await connRes.json())[0]?.hmrc_business_id || null;

    const todayStr = today();
    const periodStart = taxStart(todayStr);
    const periodEnd = todayStr;

    const totals = await computeCumulativeTotals(user.id, periodStart, periodEnd);

    return {
      statusCode: 200,
      headers: {'Content-Type': 'application/json', 'Cache-Control': 'no-store'},
      body: JSON.stringify({...totals, businessId, connected: !!businessId})
    };
  } catch (err) {
    console.error('hmrc-submission-preview error:', err);
    return {statusCode: 500, headers: {'Content-Type': 'application/json'}, body: JSON.stringify({error: err.message || 'Could not compute submission preview.'})};
  }
};
