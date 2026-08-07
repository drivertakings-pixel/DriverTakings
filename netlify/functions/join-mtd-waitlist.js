const SUPABASE_URL = 'https://srmcrwqvqsrjpkrymkth.supabase.co';
const SUPABASE_KEY = 'sb_publishable__RUy-86OViF_dqqEACwcBw_U8IgWk77';

// MTD is closed for purchase (see MTD_SALES_OPEN in create-checkout-session.js)
// until HMRC production access lands. This is the "notify me" alternative --
// idempotent, so clicking Join more than once is harmless.
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
    const headers = {apikey: service, Authorization: 'Bearer ' + service, 'Content-Type': 'application/json', Prefer: 'return=representation'};

    const check = await fetch(
      `${SUPABASE_URL}/rest/v1/mtd_waitlist?user_id=eq.${encodeURIComponent(user.id)}&select=joined_at`,
      {headers}
    );
    if (!check.ok) {
      const t = await check.text().catch(() => '');
      throw new Error(`Could not read the MTD waitlist (${check.status}): ${t}`);
    }
    const existing = await check.json();
    if (existing.length) {
      return {statusCode: 200, headers: {'Content-Type': 'application/json', 'Cache-Control': 'no-store'}, body: JSON.stringify({joined: true, joinedAt: existing[0].joined_at})};
    }

    const r = await fetch(`${SUPABASE_URL}/rest/v1/mtd_waitlist`, {
      method: 'POST',
      headers,
      body: JSON.stringify({user_id: user.id, email: user.email})
    });
    if (!r.ok) {
      const t = await r.text().catch(() => '');
      throw new Error(`Could not join the MTD waitlist (${r.status}): ${t}`);
    }
    const created = await r.json();

    return {statusCode: 200, headers: {'Content-Type': 'application/json', 'Cache-Control': 'no-store'}, body: JSON.stringify({joined: true, joinedAt: created[0]?.joined_at || new Date().toISOString()})};
  } catch (err) {
    console.error('join-mtd-waitlist error:', err);
    return {statusCode: 500, headers: {'Content-Type': 'application/json'}, body: JSON.stringify({error: err.message || 'Could not join the MTD waitlist.'})};
  }
};
