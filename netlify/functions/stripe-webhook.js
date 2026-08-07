const crypto = require('crypto');

const SUPABASE_URL = 'https://srmcrwqvqsrjpkrymkth.supabase.co';

function json(statusCode, body) {
  return {
    statusCode,
    headers: {'Content-Type': 'application/json', 'Cache-Control': 'no-store'},
    body: JSON.stringify(body)
  };
}

function rawBody(event) {
  if (event.isBase64Encoded) return Buffer.from(event.body || '', 'base64').toString('utf8');
  return event.body || '';
}

function verifyStripeSignature(payload, header, secret) {
  if (!header || !secret) return false;
  const parts = header.split(',').map(p => p.trim());
  const timestampPart = parts.find(p => p.startsWith('t='));
  const signatures = parts.filter(p => p.startsWith('v1=')).map(p => p.slice(3));
  if (!timestampPart || !signatures.length) return false;

  const timestamp = timestampPart.slice(2);
  const age = Math.abs(Math.floor(Date.now() / 1000) - Number(timestamp));
  if (!Number.isFinite(age) || age > 300) return false;

  const expected = crypto
    .createHmac('sha256', secret)
    .update(`${timestamp}.${payload}`, 'utf8')
    .digest('hex');

  return signatures.some(sig => {
    try {
      const a = Buffer.from(expected, 'hex');
      const b = Buffer.from(sig, 'hex');
      return a.length === b.length && crypto.timingSafeEqual(a, b);
    } catch {
      return false;
    }
  });
}

async function updateMembership(userId, patch) {
  const service = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!service) throw new Error('SUPABASE_SERVICE_ROLE_KEY is not configured.');

  const headers = {
    apikey: service,
    Authorization: `Bearer ${service}`,
    'Content-Type': 'application/json',
    Prefer: 'return=minimal'
  };

  const check = await fetch(
    `${SUPABASE_URL}/rest/v1/memberships?user_id=eq.${encodeURIComponent(userId)}&select=user_id`,
    {headers}
  );
  if (!check.ok) throw new Error(`Could not read DriverTakings membership (${check.status}).`);
  const rows = await check.json();

  const payload = JSON.stringify({user_id: userId, ...patch});
  const response = rows.length
    ? await fetch(
        `${SUPABASE_URL}/rest/v1/memberships?user_id=eq.${encodeURIComponent(userId)}`,
        {method: 'PATCH', headers, body: payload}
      )
    : await fetch(
        `${SUPABASE_URL}/rest/v1/memberships`,
        {method: 'POST', headers, body: payload}
      );

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Could not update DriverTakings membership (${response.status}): ${text}`);
  }
}

function tierFromObject(obj) {
  const meta = obj?.metadata || {};
  if (meta.drivertakings_plan === 'business' || meta.drivertakings_plan === 'mtd') {
    return meta.drivertakings_plan;
  }

  const priceId =
    obj?.items?.data?.[0]?.price?.id ||
    obj?.lines?.data?.[0]?.price?.id ||
    null;

  if (priceId && priceId === process.env.STRIPE_PRICE_BUSINESS) return 'business';
  if (priceId && priceId === process.env.STRIPE_PRICE_MTD) return 'mtd';
  return null;
}

function unixToIso(value) {
  return value ? new Date(value * 1000).toISOString() : null;
}

exports.handler = async (event) => {
  if (event.httpMethod !== 'POST') return json(405, {error: 'Method not allowed'});

  try {
    const secret = process.env.STRIPE_WEBHOOK_SECRET;
    if (!secret) return json(500, {error: 'STRIPE_WEBHOOK_SECRET is not configured.'});

    const payload = rawBody(event);
    const signature = event.headers['stripe-signature'] || event.headers['Stripe-Signature'];

    if (!verifyStripeSignature(payload, signature, secret)) {
      return json(400, {error: 'Invalid Stripe signature'});
    }

    const stripeEvent = JSON.parse(payload);
    const obj = stripeEvent?.data?.object || {};

    if (stripeEvent.type === 'checkout.session.completed') {
      const userId = obj?.metadata?.drivertakings_user_id || obj?.client_reference_id;
      const tier = obj?.metadata?.drivertakings_plan;
      if (userId && ['business', 'mtd'].includes(tier)) {
        await updateMembership(userId, {
          tier,
          status: 'active',
          stripe_customer_id: typeof obj.customer === 'string' ? obj.customer : obj.customer?.id || null,
          stripe_subscription_id: typeof obj.subscription === 'string' ? obj.subscription : obj.subscription?.id || null
        });
      }
    }

    if (stripeEvent.type === 'customer.subscription.created' ||
        stripeEvent.type === 'customer.subscription.updated') {
      const userId = obj?.metadata?.drivertakings_user_id;
      const tier = tierFromObject(obj);
      if (userId && tier && ['active', 'trialing'].includes(obj.status)) {
        await updateMembership(userId, {
          tier,
          status: 'active',
          stripe_customer_id: typeof obj.customer === 'string' ? obj.customer : obj.customer?.id || null,
          stripe_subscription_id: obj.id || null,
          trial_started_at: unixToIso(obj.trial_start),
          trial_ends_at: unixToIso(obj.trial_end)
        });
      }
    }

    if (stripeEvent.type === 'customer.subscription.deleted') {
      const userId = obj?.metadata?.drivertakings_user_id;
      if (userId) {
        await updateMembership(userId, {
          tier: 'free',
          status: 'active',
          stripe_customer_id: typeof obj.customer === 'string' ? obj.customer : obj.customer?.id || null,
          stripe_subscription_id: null,
          trial_started_at: null,
          trial_ends_at: null
        });
      }
    }

    return json(200, {received: true});
  } catch (err) {
    console.error('Stripe webhook error:', err);
    return json(500, {error: err.message || 'Webhook processing failed'});
  }
};
