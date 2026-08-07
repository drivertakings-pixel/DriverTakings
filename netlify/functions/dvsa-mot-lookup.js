const {lookupVehicle} = require('./lib/dvsa');

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

    if (!process.env.DVSA_CLIENT_ID || !process.env.DVSA_TOKEN_URL || !process.env.DVSA_API_KEY) {
      return {statusCode: 500, body: JSON.stringify({error: 'DVSA MOT lookup is not configured on DriverTakings yet.'})};
    }

    const body = JSON.parse(event.body || '{}');
    const registration = (body.registration || '').trim().toUpperCase();
    if (!registration) return {statusCode: 400, body: JSON.stringify({error: 'Enter a vehicle registration.'})};

    const vehicle = await lookupVehicle(registration);
    if (!vehicle) return {statusCode: 404, headers: {'Content-Type': 'application/json'}, body: JSON.stringify({error: 'No vehicle found for that registration.'})};

    return {statusCode: 200, headers: {'Content-Type': 'application/json', 'Cache-Control': 'no-store'}, body: JSON.stringify(vehicle)};
  } catch (err) {
    console.error('dvsa-mot-lookup error:', err);
    return {statusCode: 500, headers: {'Content-Type': 'application/json'}, body: JSON.stringify({error: err.message || 'Could not check MOT.'})};
  }
};
