const {getApplicationToken, buildFraudPreventionHeaders, API_BASE} = require('./lib/hmrc');

// TEMPORARY dev/setup utility -- not part of the app. Runs the exact same
// header-assembly code path (netlify/functions/lib/hmrc.js) that the live
// connect flow uses, against HMRC's Test Fraud Prevention Headers
// validator, without needing a live DriverTakings login (this validator is
// application-restricted, same as Create Test User). Intended to be called
// once by hand, then deleted from the repo.
exports.handler = async (event) => {
  if (event.httpMethod !== 'POST') return {statusCode: 405, body: JSON.stringify({error: 'Method not allowed'})};
  try {
    const signals = {
      userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
      deviceId: 'b1f7f9b2-2c3e-4a1f-9f7a-6a3b7d2e5c11',
      screens: 'width=1920&height=1080&scaling-factor=1&colour-depth=24',
      timezone: 'UTC+01:00',
      windowSize: 'width=1200&height=800'
    };
    const fpHeaders = await buildFraudPreventionHeaders(signals, event, '0b7f756d-4079-4590-b62e-adf247e40a9b');
    const appToken = await getApplicationToken();

    const r = await fetch(`${API_BASE}/test/fraud-prevention-headers/validate`, {
      method: 'POST',
      headers: {
        Authorization: 'Bearer ' + appToken,
        Accept: 'application/vnd.hmrc.1.0+json',
        ...fpHeaders
      }
    });
    const result = await r.json().catch(() => ({}));

    return {
      statusCode: 200,
      headers: {'Content-Type': 'application/json'},
      body: JSON.stringify({hmrcStatus: r.status, headersSent: fpHeaders, result})
    };
  } catch (err) {
    console.error('hmrc-dev-validate-headers error:', err);
    return {statusCode: 500, headers: {'Content-Type': 'application/json'}, body: JSON.stringify({error: err.message})};
  }
};
