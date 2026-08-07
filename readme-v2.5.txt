DriverTakings V2.5 — DRIVER-FIRST APP SHELL

This build deliberately preserves the public homepage and moves the signed-in product into dedicated areas:
Dashboard / Takings / Costs / Reports / Tax position / Driver & vehicle / Account / MTD.

Before testing Account surname / NI saving, run V2.5-DATABASE-MIGRATION.sql in Supabase SQL Editor.

For Stripe checkout to promote Free -> Business/MTD after successful checkout, Netlify must contain SUPABASE_SERVICE_ROLE_KEY as a secret Function/Runtime environment variable. Never put that key into browser code.

MTD has no launch-discount wording. The Business launch promotion remains a Stripe promotion-code concern only.

V2.5 intentionally does NOT pretend that vehicle/reminder fields are saved before their database schema is added. Those screens show the driver-first product direction without silently losing data.
