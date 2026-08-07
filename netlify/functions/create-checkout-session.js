const SUPABASE_URL='https://srmcrwqvqsrjpkrymkth.supabase.co';
const SUPABASE_KEY='sb_publishable__RUy-86OViF_dqqEACwcBw_U8IgWk77';

exports.handler=async(event)=>{
  if(event.httpMethod!=='POST') return {statusCode:405,body:JSON.stringify({error:'Method not allowed'})};
  try{
    const auth=event.headers.authorization||event.headers.Authorization||'';
    if(!auth.startsWith('Bearer ')) return {statusCode:401,body:JSON.stringify({error:'Please log in before upgrading.'})};
    const token=auth.slice(7);
    const u=await fetch(SUPABASE_URL+'/auth/v1/user',{headers:{apikey:SUPABASE_KEY,Authorization:'Bearer '+token}});
    if(!u.ok) return {statusCode:401,body:JSON.stringify({error:'Your login session could not be verified.'})};
    const user=await u.json();
    const body=JSON.parse(event.body||'{}');
    const plan=body.plan;
    if(!['business','mtd'].includes(plan)) return {statusCode:400,body:JSON.stringify({error:'Unknown DriverTakings plan.'})};
    const price=plan==='business'?process.env.STRIPE_PRICE_BUSINESS:process.env.STRIPE_PRICE_MTD;
    const secret=process.env.STRIPE_SECRET_KEY;
    if(!price||!secret) return {statusCode:500,body:JSON.stringify({error:'Stripe is not fully configured on DriverTakings yet.'})};
    const origin=(event.headers.origin&&event.headers.origin.startsWith('https://'))?event.headers.origin:'https://drivertakings.co.uk';
    const form=new URLSearchParams();
    form.set('mode','subscription');
    form.set('line_items[0][price]',price);
    form.set('line_items[0][quantity]','1');
    form.set('client_reference_id',user.id);
    if(user.email) form.set('customer_email',user.email);
    form.set('success_url',origin+'/app/?checkout=success&session_id={CHECKOUT_SESSION_ID}');
    form.set('cancel_url',origin+'/app/?checkout=cancelled');
    // Standard subscriptions start immediately. Launch offers are applied only via Stripe promotion codes.
    form.set('allow_promotion_codes','true');
    form.set('subscription_data[metadata][drivertakings_user_id]',user.id);
    form.set('subscription_data[metadata][drivertakings_plan]',plan);
    form.set('metadata[drivertakings_user_id]',user.id);
    form.set('metadata[drivertakings_plan]',plan);
    const r=await fetch('https://api.stripe.com/v1/checkout/sessions',{method:'POST',headers:{Authorization:'Bearer '+secret,'Content-Type':'application/x-www-form-urlencoded'},body:form.toString()});
    const data=await r.json();
    if(!r.ok) throw new Error(data?.error?.message||'Stripe rejected the checkout request.');
    return {statusCode:200,headers:{'Content-Type':'application/json','Cache-Control':'no-store'},body:JSON.stringify({url:data.url})};
  }catch(err){console.error(err);return {statusCode:500,headers:{'Content-Type':'application/json'},body:JSON.stringify({error:err.message||'Checkout could not be created.'})};}
};
