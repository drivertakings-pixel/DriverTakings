const SUPABASE_URL = 'https://srmcrwqvqsrjpkrymkth.supabase.co';
const SUPABASE_KEY = 'sb_publishable__RUy-86OViF_dqqEACwcBw_U8IgWk77';

// Returns a derived, token-free summary of the driver's HMRC connection.
// The app must never read hmrc_connections directly -- this is the only
// sanctioned way the browser learns connection state.
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

    const r = await fetch(
      `${SUPABASE_URL}/rest/v1/hmrc_connections?user_id=eq.${encodeURIComponent(user.id)}&select=hmrc_business_id,connected_at`,
      {headers: {apikey: service, Authorization: 'Bearer ' + service}}
    );
    if (!r.ok) {
      const t = await r.text().catch(() => '');
      throw new Error(`Could not read HMRC connection status (${r.status}): ${t}`);
    }
    const rows = await r.json();
    const row = rows[0];

    return {
      statusCode: 200,
      headers: {'Content-Type': 'application/json', 'Cache-Control': 'no-store'},
      body: JSON.stringify({
        connected: !!row?.connected_at,
        businessId: row?.hmrc_business_id || null,
        connectedAt: row?.connected_at || null
      })
    };
  } catch (err) {
    console.error('hmrc-status error:', err);
    return {statusCode: 500, headers: {'Content-Type': 'application/json'}, body: JSON.stringify({error: err.message || 'Could not check HMRC connection.'})};
  }
};
