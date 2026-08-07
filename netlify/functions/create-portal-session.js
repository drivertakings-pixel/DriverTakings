const SUPABASE_URL = 'https://srmcrwqvqsrjpkrymkth.supabase.co';
const SUPABASE_KEY = 'sb_publishable__RUy-86OViF_dqqEACwcBw_U8IgWk77';

// Opens Stripe's own hosted Customer Portal, where the driver can cancel,
// change payment method, or view invoices -- Stripe is the authority on
// cancellation policy/timing (configured in the Stripe Dashboard, not
// here). stripe-webhook.js already reacts correctly to whatever Stripe
// does as a result (customer.subscription.updated/deleted), so nothing
// else needs to change when someone cancels through this.
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

    const mRes = await fetch(
      `${SUPABASE_URL}/rest/v1/memberships?user_id=eq.${encodeURIComponent(user.id)}&select=stripe_customer_id`,
      {headers: {apikey: service, Authorization: 'Bearer ' + service}}
    );
    const customerId = (await mRes.json())[0]?.stripe_customer_id;
    if (!customerId) return {statusCode: 400, body: JSON.stringify({error: 'No subscription found for this account yet.'})};

    const secret = process.env.STRIPE_SECRET_KEY;
    if (!secret) return {statusCode: 500, body: JSON.stringify({error: 'Stripe is not fully configured on DriverTakings yet.'})};

    const origin = (event.headers.origin && event.headers.origin.startsWith('https://')) ? event.headers.origin : 'https://drivertakings.co.uk';
    const form = new URLSearchParams();
    form.set('customer', customerId);
    form.set('return_url', origin + '/app/account/');

    const r = await fetch('https://api.stripe.com/v1/billing_portal/sessions', {
      method: 'POST',
      headers: {Authorization: 'Bearer ' + secret, 'Content-Type': 'application/x-www-form-urlencoded'},
      body: form.toString()
    });
    const data = await r.json();
    if (!r.ok) throw new Error(data?.error?.message || 'Stripe rejected the portal request.');

    return {statusCode: 200, headers: {'Content-Type': 'application/json', 'Cache-Control': 'no-store'}, body: JSON.stringify({url: data.url})};
  } catch (err) {
    console.error('create-portal-session error:', err);
    return {statusCode: 500, headers: {'Content-Type': 'application/json'}, body: JSON.stringify({error: err.message || 'Could not open subscription management.'})};
  }
};
