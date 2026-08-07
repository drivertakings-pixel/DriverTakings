DriverTakings V2.4.1 — Stripe Checkout Build

WHAT CHANGED
- Preserves the V2.4 public/login/member architecture.
- Larger member-area DriverTakings logo.
- Stronger Business and MTD upgrade cards.
- Business £3.99/month and MTD £5.99/month buttons now create secure Stripe-hosted subscription Checkout Sessions.
- Launch checkout includes a 60-day Stripe trial.
- Homepage calculator remains permanent and now shows estimated 25% tax provision, illustrative 6% Class 4 NI provision and “Yours to spend — estimated”.
- Demo costs changed to £25 fuel + £10 other costs.

IMPORTANT
This build creates real live Stripe Checkout sessions using the Netlify environment variables already configured. It DOES NOT yet change Supabase membership entitlement after payment. That must be done by the Stripe webhook stage so Stripe, not the browser, is the authority for paid access. Do not manually unlock memberships from checkout success alone.

NEXT STAGE AFTER DEPLOY TEST
1. Confirm Business button opens the correct £3.99 Stripe product and displays the 60-day trial.
2. Cancel Checkout rather than completing a real subscription during the first smoke test.
3. Add a Supabase server-side credential in Netlify.
4. Add the Stripe webhook endpoint and STRIPE_WEBHOOK_SECRET.
5. Sync checkout/subscription lifecycle to memberships, then activate paid entitlements.

SECURITY
STRIPE_SECRET_KEY is used only inside the Netlify Function. It is never placed in browser HTML/JavaScript.


V2.4.2 PROMO-CODE UPDATE
- Removed universal 60-day Stripe trial.
- Standard paid subscriptions bill at their normal monthly price.
- Stripe Checkout now accepts promotion codes.
- Launch offer is to be configured in Stripe as a separate 100%-off promotion, limited to 100 redemptions, for two monthly billing periods.

V2.4.3 FIXED-BASELINE RESTORATION
- Restored Total Takings as the primary entry; Cash is calculated from Total minus Card minus On Account.
- Hours accepts driver-friendly 8.30 / 1.30 input (colon is also tolerated).
- Restored member tax-year estimate panel: profit, 25% tax provision, illustrative 6% Class 4 NI provision, Yours to spend — estimated.
- Business members display as DriverTakings Business and no longer see the Business upgrade card.
- Added secure post-Checkout entitlement confirmation function. Requires Netlify SUPABASE_SERVICE_ROLE_KEY.
- Existing public website structure and member-dashboard design preserved; this is a repair build, not a redesign.


V2.4.4 FIXED BASELINE UX
- Dashboard auto-updates after save/edit/delete.
- Recent Activity supports edit/delete.
- CSV export added.
- Headline cards show gross takings; tax/NI/estimated spend remains visible.
- Stripe checkout confirmation no longer loses the session_id before entitlement confirmation.
- Requires Netlify secret SUPABASE_SERVICE_ROLE_KEY for server-side membership confirmation.
