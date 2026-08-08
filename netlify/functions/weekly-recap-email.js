const SUPABASE_URL = 'https://srmcrwqvqsrjpkrymkth.supabase.co';

// Scheduled every Monday morning (see netlify.toml). Sends a short "here's
// your week" email to every user who actually logged something in the
// week just gone -- not a marketing message, so it goes out regardless of
// profiles.marketing_consent, gated only by profiles.weekly_recap_opt_out.
// Users with zero activity in the window are skipped rather than sent a
// "you did nothing" nag -- a separate lapsed-user win-back email would be
// a deliberate, different feature, not this one.
//
// Uses one Brevo transactional-email call per recipient (no bulk/template
// API involved) -- fine at this user count; if volume grows enough for
// this to matter, that's a good problem to have and worth revisiting then.

function lastWeekRange() {
  const now = new Date();
  const day = now.getUTCDay(); // 0=Sun..6=Sat
  const sinceMonday = (day + 6) % 7;
  const thisMonday = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() - sinceMonday));
  const lastMonday = new Date(thisMonday); lastMonday.setUTCDate(thisMonday.getUTCDate() - 7);
  const lastSunday = new Date(thisMonday); lastSunday.setUTCDate(thisMonday.getUTCDate() - 1);
  const fmt = d => d.toISOString().slice(0, 10);
  return { from: fmt(lastMonday), to: fmt(lastSunday) };
}

function money(n) { return '£' + (Number(n) || 0).toFixed(2); }

function recapHtml({ name, from, to, gross, costs, profit, hours, days }) {
  const perHour = hours > 0 ? money((profit / hours)) : null;
  return `<div style="font-family:Arial,sans-serif;max-width:520px;margin:0 auto;color:#111827">
<h2 style="margin:0 0 4px">Hi${name ? ' ' + name : ''}, here's your week</h2>
<p style="color:#6b7280;margin:0 0 20px">${from} to ${to}</p>
<table style="width:100%;border-collapse:collapse;margin-bottom:18px">
<tr><td style="padding:8px 0;border-bottom:1px solid #e5e7eb">Takings</td><td style="padding:8px 0;border-bottom:1px solid #e5e7eb;text-align:right;font-weight:bold">${money(gross)}</td></tr>
<tr><td style="padding:8px 0;border-bottom:1px solid #e5e7eb">Costs</td><td style="padding:8px 0;border-bottom:1px solid #e5e7eb;text-align:right">${money(costs)}</td></tr>
<tr><td style="padding:8px 0;border-bottom:1px solid #e5e7eb">Profit</td><td style="padding:8px 0;border-bottom:1px solid #e5e7eb;text-align:right;font-weight:bold">${money(profit)}</td></tr>
${hours > 0 ? `<tr><td style="padding:8px 0">Hours worked${perHour ? ' (£' + perHour.slice(1) + '/hr)' : ''}</td><td style="padding:8px 0;text-align:right">${hours.toFixed(1)}</td></tr>` : ''}
</table>
<p style="color:#6b7280">Logged on ${days} day${days === 1 ? '' : 's'} this week.</p>
<p><a href="https://drivertakings.co.uk/app/reports/" style="background:#fbbf24;color:#111827;padding:10px 18px;border-radius:8px;text-decoration:none;font-weight:bold;display:inline-block">See your full report</a></p>
<p style="color:#9ca3af;font-size:12px;margin-top:28px">You're getting this because you have a DriverTakings account. Turn it off anytime under Account → Preferences.</p>
</div>`;
}

exports.handler = async () => {
  const service = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const brevoKey = process.env.BREVO_API_KEY;
  const senderEmail = process.env.BREVO_SENDER_EMAIL;
  const senderName = process.env.BREVO_SENDER_NAME || 'DriverTakings';
  if (!service) return { statusCode: 500, body: 'SUPABASE_SERVICE_ROLE_KEY is not configured.' };
  if (!brevoKey || !senderEmail) return { statusCode: 500, body: 'BREVO_API_KEY / BREVO_SENDER_EMAIL is not configured -- weekly recap skipped.' };

  const headers = { apikey: service, Authorization: 'Bearer ' + service, 'Content-Type': 'application/json' };
  const { from, to } = lastWeekRange();

  try {
    // 1. All auth users (paginated) -> id, email
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

    // 2. Profiles: names + opt-out + idempotency stamp
    const profRes = await fetch(`${SUPABASE_URL}/rest/v1/profiles?select=id,first_name,preferred_name,weekly_recap_opt_out,last_recap_week_start`, { headers });
    if (!profRes.ok) throw new Error('Could not read profiles (' + profRes.status + ')');
    const profiles = await profRes.json();
    const profileMap = Object.fromEntries(profiles.map(p => [p.id, p]));

    // 3. Takings + expenses in the window
    const [takRes, expRes] = await Promise.all([
      fetch(`${SUPABASE_URL}/rest/v1/daily_takings?select=user_id,work_date,gross_takings,hours_worked_minutes&work_date=gte.${from}&work_date=lte.${to}`, { headers }),
      fetch(`${SUPABASE_URL}/rest/v1/expenses?select=user_id,expense_date,actual_cost_amount,amount&expense_date=gte.${from}&expense_date=lte.${to}`, { headers })
    ]);
    if (!takRes.ok) throw new Error('Could not read takings (' + takRes.status + ')');
    if (!expRes.ok) throw new Error('Could not read expenses (' + expRes.status + ')');
    const takings = await takRes.json(), expenses = await expRes.json();

    const byUser = {};
    const bucket = uid => byUser[uid] || (byUser[uid] = { gross: 0, costs: 0, minutes: 0, days: new Set() });
    takings.forEach(t => { const b = bucket(t.user_id); b.gross += Number(t.gross_takings || 0); b.minutes += Number(t.hours_worked_minutes || 0); b.days.add(t.work_date); });
    expenses.forEach(x => { const b = bucket(x.user_id); b.costs += Number(x.actual_cost_amount ?? x.amount ?? 0); });

    let sent = 0, skippedNoActivity = 0, skippedOptOut = 0, skippedAlreadySent = 0, failed = 0;

    for (const [uid, b] of Object.entries(byUser)) {
      if (b.days.size === 0) { skippedNoActivity++; continue; }
      const profile = profileMap[uid] || {};
      if (profile.weekly_recap_opt_out) { skippedOptOut++; continue; }
      if (profile.last_recap_week_start === from) { skippedAlreadySent++; continue; }
      const user = users.find(u => u.id === uid);
      if (!user || !user.email) { failed++; continue; }

      const name = profile.preferred_name || profile.first_name || '';
      const html = recapHtml({
        name, from, to,
        gross: b.gross, costs: b.costs, profit: b.gross - b.costs,
        hours: b.minutes / 60, days: b.days.size
      });

      try {
        const r = await fetch('https://api.brevo.com/v3/smtp/email', {
          method: 'POST',
          headers: { 'api-key': brevoKey, 'Content-Type': 'application/json' },
          body: JSON.stringify({
            sender: { name: senderName, email: senderEmail },
            to: [{ email: user.email, name }],
            subject: `Your DriverTakings week: ${money(b.gross - b.costs)} profit`,
            htmlContent: html
          })
        });
        if (!r.ok) { failed++; console.error('Brevo send failed for', user.email, r.status, await r.text().catch(() => '')); continue; }
        await fetch(`${SUPABASE_URL}/rest/v1/profiles?id=eq.${encodeURIComponent(uid)}`, { method: 'PATCH', headers, body: JSON.stringify({ last_recap_week_start: from }) });
        sent++;
      } catch (e) { failed++; console.error('Brevo send error for', user.email, e); }
    }

    const summary = { week: { from, to }, sent, skippedNoActivity, skippedOptOut, skippedAlreadySent, failed };
    console.log('weekly-recap-email summary:', JSON.stringify(summary));
    return { statusCode: 200, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(summary) };
  } catch (err) {
    console.error('weekly-recap-email error:', err);
    return { statusCode: 500, body: err.message || 'Weekly recap failed.' };
  }
};
