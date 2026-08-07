// Shared helper for HMRC MTD ITSA integration. Matches the rest of this
// repo's style: CommonJS, raw fetch, no npm dependencies, no SDK.
//
// HMRC endpoint facts below were verified against HMRC's own Developer Hub
// documentation (not assumed). See V2.5.4-HMRC-CONNECTIONS.sql and the
// hmrc-* functions for how this is used.

const HMRC_ENV = process.env.HMRC_ENV || 'sandbox';

// Sandbox: authorize and token live on DIFFERENT hosts -- this is correct,
// not a typo. Production later just needs HMRC_ENV=production; no code change.
const AUTHORIZE_BASE = HMRC_ENV === 'production'
  ? 'https://www.tax.service.gov.uk'
  : 'https://test-www.tax.service.gov.uk';
const API_BASE = HMRC_ENV === 'production'
  ? 'https://api.service.hmrc.gov.uk'
  : 'https://test-api.service.hmrc.gov.uk';

function authorizeUrl(state, scope) {
  const params = new URLSearchParams();
  params.set('response_type', 'code');
  params.set('client_id', process.env.HMRC_CLIENT_ID);
  params.set('scope', scope || process.env.HMRC_SCOPE || 'read:self-assessment');
  params.set('redirect_uri', process.env.HMRC_REDIRECT_URI);
  params.set('state', state);
  // PKCE is optional per HMRC's docs ("we also support PKCE, but you do not
  // have to use it") -- deliberately omitted for Phase 1 simplicity.
  return `${AUTHORIZE_BASE}/oauth/authorize?${params.toString()}`;
}

async function exchangeCodeForToken(code) {
  const form = new URLSearchParams();
  form.set('grant_type', 'authorization_code');
  form.set('client_id', process.env.HMRC_CLIENT_ID);
  form.set('client_secret', process.env.HMRC_CLIENT_SECRET);
  form.set('redirect_uri', process.env.HMRC_REDIRECT_URI);
  form.set('code', code);
  const r = await fetch(`${API_BASE}/oauth/token`, {
    method: 'POST',
    headers: {'Content-Type': 'application/x-www-form-urlencoded'},
    body: form.toString()
  });
  const data = await r.json();
  if (!r.ok) throw new Error(data?.error_description || data?.error || 'HMRC token exchange failed.');
  return data; // {access_token, refresh_token, expires_in, scope, token_type}
}

async function refreshAccessToken(refreshToken) {
  // Not called anywhere in Phase 1 (the only Phase 1 API call happens
  // immediately after token issuance) -- stubbed here for future phases so
  // the token-exchange shape only needs to be right once.
  const form = new URLSearchParams();
  form.set('grant_type', 'refresh_token');
  form.set('client_id', process.env.HMRC_CLIENT_ID);
  form.set('client_secret', process.env.HMRC_CLIENT_SECRET);
  form.set('refresh_token', refreshToken);
  const r = await fetch(`${API_BASE}/oauth/token`, {
    method: 'POST',
    headers: {'Content-Type': 'application/x-www-form-urlencoded'},
    body: form.toString()
  });
  const data = await r.json();
  if (!r.ok) throw new Error(data?.error_description || data?.error || 'HMRC token refresh failed.');
  return data;
}

async function getApplicationToken(scope) {
  // Application-restricted (client_credentials) token -- no user involved.
  // Used only by the Test Fraud Prevention Headers validator today.
  const form = new URLSearchParams();
  form.set('grant_type', 'client_credentials');
  form.set('client_id', process.env.HMRC_CLIENT_ID);
  form.set('client_secret', process.env.HMRC_CLIENT_SECRET);
  if (scope) form.set('scope', scope);
  const r = await fetch(`${API_BASE}/oauth/token`, {
    method: 'POST',
    headers: {'Content-Type': 'application/x-www-form-urlencoded'},
    body: form.toString()
  });
  const data = await r.json();
  if (!r.ok) throw new Error(data?.error_description || data?.error || 'HMRC application token request failed.');
  return data.access_token;
}

function clientIpFromEvent(event) {
  const h = event.headers || {};
  return h['x-nf-client-connection-ip']
    || h['client-ip']
    || (h['x-forwarded-for'] || '').split(',')[0].trim()
    || null;
}

// Best-effort lookup of this function's own outbound public IP, for
// Gov-Vendor-Public-IP. Netlify Functions run on shared, rotating
// infrastructure with no fixed egress IP, so this is inherently best-effort
// -- if it fails or times out, the header is simply omitted rather than
// fabricated. Whether that's acceptable is exactly what the Test Fraud
// Prevention Headers validator (hmrc-validate-headers.js) tells us.
async function vendorPublicIp() {
  try {
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), 2000);
    const r = await fetch('https://api.ipify.org?format=json', {signal: ctrl.signal});
    clearTimeout(t);
    if (!r.ok) return null;
    const data = await r.json();
    return data.ip || null;
  } catch {
    return null;
  }
}

// Builds the Gov-Client-*/Gov-Vendor-* header set for the "Web application
// via server" connection method (browser -> this Netlify Function -> HMRC).
// `storedSignals` is whatever assets/hmrc-fraud.js collected in the browser
// before the redirect to HMRC (see hmrc-authorize-url.js), persisted on the
// hmrc_oauth_state row since the callback leg has no JS execution to
// re-collect them. Some header formats below (Gov-Client-User-IDs,
// Gov-Vendor-Forwarded) are best-effort against HMRC's documented
// conventions -- treat hmrc-validate-headers.js's result as the source of
// truth, not this comment.
async function buildFraudPreventionHeaders(storedSignals, event, userId) {
  const signals = storedSignals || {};
  const clientIp = clientIpFromEvent(event);
  const nowIso = new Date().toISOString(); // already yyyy-MM-ddThh:mm:ss.sssZ

  const headers = {
    'Gov-Client-Connection-Method': 'WEB_APP_VIA_SERVER',
    'Gov-Vendor-Version': process.env.HMRC_VENDOR_VERSION || 'drivertakings=1.0',
    'Gov-Vendor-Product-Name': process.env.HMRC_VENDOR_PRODUCT_NAME || 'DriverTakings'
  };

  if (signals.userAgent) headers['Gov-Client-Browser-JS-User-Agent'] = signals.userAgent;
  if (signals.deviceId) headers['Gov-Client-Device-ID'] = signals.deviceId;
  if (signals.screens) headers['Gov-Client-Screens'] = signals.screens;
  if (signals.timezone) headers['Gov-Client-Timezone'] = signals.timezone;
  if (signals.windowSize) headers['Gov-Client-Window-Size'] = signals.windowSize;

  if (clientIp) {
    headers['Gov-Client-Public-IP'] = clientIp;
    headers['Gov-Client-Public-IP-Timestamp'] = nowIso;
  }
  // Gov-Client-Public-Port: the true source TCP port isn't visible to a
  // serverless function behind Netlify's edge -- deliberately omitted
  // rather than fabricated. HMRC's docs mark this optional over what it
  // considers a private/managed connection; validate via hmrc-validate-headers.js.

  if (userId) headers['Gov-Client-User-IDs'] = `DriverTakings=${userId}`;

  const vendorIp = await vendorPublicIp();
  if (vendorIp) {
    headers['Gov-Vendor-Public-IP'] = vendorIp;
    if (clientIp) headers['Gov-Vendor-Forwarded'] = `by=${vendorIp}&for=${clientIp}`;
  }

  return headers;
}

module.exports = {
  HMRC_ENV,
  AUTHORIZE_BASE,
  API_BASE,
  authorizeUrl,
  exchangeCodeForToken,
  refreshAccessToken,
  getApplicationToken,
  buildFraudPreventionHeaders
};
