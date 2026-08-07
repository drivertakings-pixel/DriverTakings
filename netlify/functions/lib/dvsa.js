// Shared helper for DVSA MOT History API integration. Mirrors lib/hmrc.js's
// shape: CommonJS, raw fetch, no npm dependencies.
//
// UNCONFIRMED PENDING REAL CREDENTIALS (registration takes DVSA up to 5
// working days to review -- see documentation.history.mot.api.gov.uk):
//  - Exact API base URL (DVSA_API_BASE below is a best-guess default,
//    override via env once confirmed).
//  - Exact header name for the separate API key (assumed 'x-api-key'
//    below -- confirm against the credentials email DVSA sends).
//  - Exact MOT expiry field name in the response (handled defensively in
//    extractMotExpiry() below rather than asserted).
// 90-day inactivity revokes the API key -- not a design concern now.

const DVSA_API_BASE = process.env.DVSA_API_BASE || 'https://history.mot.api.gov.uk/v1/trade/vehicles';

async function getAccessToken() {
  // client_credentials grant via Microsoft Entra ID. DVSA_TOKEN_URL is the
  // full, tenant-specific URL from DVSA's credentials email -- unlike
  // HMRC's fixed hosts, this can't be derived from an environment flag.
  const form = new URLSearchParams();
  form.set('grant_type', 'client_credentials');
  form.set('client_id', process.env.DVSA_CLIENT_ID);
  form.set('client_secret', process.env.DVSA_CLIENT_SECRET);
  form.set('scope', process.env.DVSA_SCOPE);
  const r = await fetch(process.env.DVSA_TOKEN_URL, {
    method: 'POST',
    headers: {'Content-Type': 'application/x-www-form-urlencoded'},
    body: form.toString()
  });
  const data = await r.json();
  if (!r.ok) throw new Error(data?.error_description || data?.error || 'DVSA token request failed.');
  return data.access_token;
}

function extractMotExpiry(vehicle) {
  // Field naming has changed across DVSA API versions and isn't pinned
  // down with confidence -- check every candidate rather than assume one.
  if (!vehicle) return null;
  if (vehicle.motTestExpiryDate) return vehicle.motTestExpiryDate;
  if (vehicle.motTestDueDate) return vehicle.motTestDueDate;
  if (vehicle.motExpiryDate) return vehicle.motExpiryDate;
  // Fallback: the documented v1 shape returns a `motTests` array (one row
  // per historical test) rather than a single top-level expiry field --
  // use the most recently completed test's expiry date if present.
  if (Array.isArray(vehicle.motTests) && vehicle.motTests.length) {
    const sorted = [...vehicle.motTests].sort((a, b) => new Date(b.completedDate || 0) - new Date(a.completedDate || 0));
    return (sorted.find(t => t.expiryDate) || sorted[0]).expiryDate || null;
  }
  return null;
}

async function lookupVehicle(registration) {
  const token = await getAccessToken();
  const r = await fetch(`${DVSA_API_BASE}/registration/${encodeURIComponent(registration)}`, {
    headers: {
      Authorization: 'Bearer ' + token,
      'x-api-key': process.env.DVSA_API_KEY, // header name unconfirmed -- verify against DVSA's docs/credentials email
      Accept: 'application/json'
    }
  });
  if (r.status === 404) return null; // vehicle/registration not found
  const data = await r.json();
  if (!r.ok) throw new Error(data?.errorMessage || data?.message || 'DVSA vehicle lookup failed.');
  return {
    motExpiryDate: extractMotExpiry(data),
    motStatus: data.motTestResult || data.motStatus || null,
    make: data.make || null,
    model: data.model || null
  };
}

module.exports = {getAccessToken, lookupVehicle, extractMotExpiry, DVSA_API_BASE};
