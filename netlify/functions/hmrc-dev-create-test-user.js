const {getApplicationToken, API_BASE} = require('./lib/hmrc');

// TEMPORARY dev/setup utility -- not part of the app. Creates one HMRC
// sandbox test individual (Government Gateway credentials + NINO + MTD IT
// ID) via HMRC's application-restricted Create Test User API, so the OAuth
// connect flow has something real to authenticate against. Intended to be
// called once by hand, then deleted from the repo.
exports.handler = async (event) => {
  if (event.httpMethod !== 'POST') return {statusCode: 405, body: JSON.stringify({error: 'Method not allowed'})};
  try {
    const token = await getApplicationToken();
    const r = await fetch(`${API_BASE}/create-test-user/individuals`, {
      method: 'POST',
      headers: {
        Authorization: 'Bearer ' + token,
        'Content-Type': 'application/json',
        Accept: 'application/vnd.hmrc.1.0+json'
      },
      body: JSON.stringify({serviceNames: ['national-insurance', 'self-assessment', 'mtd-income-tax']})
    });
    const data = await r.json();
    return {statusCode: r.status, headers: {'Content-Type': 'application/json'}, body: JSON.stringify(data)};
  } catch (err) {
    console.error('hmrc-dev-create-test-user error:', err);
    return {statusCode: 500, headers: {'Content-Type': 'application/json'}, body: JSON.stringify({error: err.message})};
  }
};
