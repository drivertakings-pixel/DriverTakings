const SUPABASE_URL = 'https://srmcrwqvqsrjpkrymkth.supabase.co';
const SUPABASE_KEY = 'sb_publishable__RUy-86OViF_dqqEACwcBw_U8IgWk77';

// Gated to a single hardcoded founder email rather than any kind of
// is_admin flag/role -- this is a one-person business, and a flag on a
// table is one more thing that could be misconfigured or granted wrong.
// A hardcoded check here is the simplest thing that's actually correct.
const FOUNDER_EMAIL = 'daveh11798@gmail.com';

exports.handler = async (event) => {
  try {
    const auth = event.headers.authorization || event.headers.Authorization || '';
    if (!auth.startsWith('Bearer ')) return { statusCode: 401, body: JSON.stringify({ error: 'Please log in.' }) };
    const token = auth.slice(7);
    const u = await fetch(SUPABASE_URL + '/auth/v1/user', { headers: { apikey: SUPABASE_KEY, Authorization: 'Bearer ' + token } });
    if (!u.ok) return { statusCode: 401, body: JSON.stringify({ error: 'Your login session could not be verified.' }) };
    const user = await u.json();
    if ((user.email || '').toLowerCase() !== FOUNDER_EMAIL) return { statusCode: 403, body: JSON.stringify({ error: 'Not authorised.' }) };

    const service = process.env.SUPABASE_SERVICE_ROLE_KEY;
    if (!service) return { statusCode: 500, body: JSON.stringify({ error: 'SUPABASE_SERVICE_ROLE_KEY is not configured.' }) };
    const headers = { apikey: service, Authorization: 'Bearer ' + service };

    // All auth users (paginated) -- created_at lives on auth.users, not
    // profiles, so this is the reliable source for signup dates.
    let users = [], page = 1;
    while (true) {
      const r = await fetch(`${SUPABASE_URL}/auth/v1/admin/users?page=${page}&per_page=1000`, { headers });
      if (!r.ok) throw new Error('Could not list users (' + r.status + ')');
      const j = await r.json();
      const batch = j.users || [];
      users.push(...batch);
      if (batch.length < 1000) break;
      page++;
    }

    const memRes = await fetch(`${SUPABASE_URL}/rest/v1/memberships?select=user_id,tier,status`, { headers });
    if (!memRes.ok) throw new Error('Could not read memberships (' + memRes.status + ')');
    const memberships = await memRes.json();
    const membershipByUser = Object.fromEntries(memberships.map(m => [m.user_id, m]));

    const tierCounts = { free: 0, mtd: 0, business: 0 };
    const now = new Date();
    const weekAgo = new Date(now.getTime() - 7 * 86400000);
    const monthStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
    let signupsWeek = 0, signupsMonth = 0;

    users.forEach(u => {
      const tier = membershipByUser[u.id]?.tier || 'free';
      tierCounts[tier] = (tierCounts[tier] || 0) + 1;
      const created = new Date(u.created_at);
      if (created >= weekAgo) signupsWeek++;
      if (created >= monthStart) signupsMonth++;
    });

    return {
      statusCode: 200,
      headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
      body: JSON.stringify({ totalUsers: users.length, tierCounts, signupsWeek, signupsMonth, generatedAt: now.toISOString() })
    };
  } catch (err) {
    console.error('founder-metrics error:', err);
    return { statusCode: 500, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ error: err.message || 'Could not load metrics.' }) };
  }
};
