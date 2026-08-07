const SUPABASE_URL='https://srmcrwqvqsrjpkrymkth.supabase.co';
const SUPABASE_KEY='sb_publishable__RUy-86OViF_dqqEACwcBw_U8IgWk77';

async function setMembership(userId,tier,status='active'){
  const service=process.env.SUPABASE_SERVICE_ROLE_KEY;
  if(!service) throw new Error('SUPABASE_SERVICE_ROLE_KEY is not configured in Netlify.');
  const headers={apikey:service,Authorization:'Bearer '+service,'Content-Type':'application/json',Prefer:'return=minimal'};
  const check=await fetch(`${SUPABASE_URL}/rest/v1/memberships?user_id=eq.${encodeURIComponent(userId)}&select=user_id`,{headers});
  if(!check.ok){const t=await check.text().catch(()=>'');throw new Error(`Could not read DriverTakings membership (${check.status}): ${t}`);}
  const rows=await check.json();
  const payload=JSON.stringify({user_id:userId,tier,status});
  const r=rows.length
    ? await fetch(`${SUPABASE_URL}/rest/v1/memberships?user_id=eq.${encodeURIComponent(userId)}`,{method:'PATCH',headers,body:payload})
    : await fetch(`${SUPABASE_URL}/rest/v1/memberships`,{method:'POST',headers,body:payload});
  if(!r.ok){const t=await r.text().catch(()=>'');throw new Error(`Could not update DriverTakings membership (${r.status}): ${t}`);}
}
exports.handler=async(event)=>{
  if(event.httpMethod!=='POST') return {statusCode:405,body:JSON.stringify({error:'Method not allowed'})};
  try{
    const auth=event.headers.authorization||event.headers.Authorization||'';
    if(!auth.startsWith('Bearer ')) return {statusCode:401,body:JSON.stringify({error:'Please log in.'})};
    const token=auth.slice(7);
    const u=await fetch(SUPABASE_URL+'/auth/v1/user',{headers:{apikey:SUPABASE_KEY,Authorization:'Bearer '+token}});
    if(!u.ok) return {statusCode:401,body:JSON.stringify({error:'Your login session could not be verified.'})};
    const user=await u.json();
    const {session_id}=JSON.parse(event.body||'{}');
    if(!session_id||!session_id.startsWith('cs_')) return {statusCode:400,body:JSON.stringify({error:'Missing checkout session.'})};
    const secret=process.env.STRIPE_SECRET_KEY;
    const r=await fetch('https://api.stripe.com/v1/checkout/sessions/'+encodeURIComponent(session_id),{headers:{Authorization:'Bearer '+secret}});
    const checkout=await r.json();
    if(!r.ok) throw new Error(checkout?.error?.message||'Could not verify Stripe Checkout.');
    if(checkout.client_reference_id!==user.id) return {statusCode:403,body:JSON.stringify({error:'This checkout does not belong to your account.'})};
    if(checkout.status!=='complete') return {statusCode:409,body:JSON.stringify({error:'Stripe Checkout is not complete yet.'})};
    const tier=checkout.metadata?.drivertakings_plan;
    if(!['business','mtd'].includes(tier)) throw new Error('Stripe Checkout did not contain a DriverTakings plan.');
    await setMembership(user.id,tier,'active');
    return {statusCode:200,headers:{'Content-Type':'application/json','Cache-Control':'no-store'},body:JSON.stringify({tier})};
  }catch(err){console.error(err);return {statusCode:500,headers:{'Content-Type':'application/json'},body:JSON.stringify({error:err.message||'Checkout could not be confirmed.'})};}
};
