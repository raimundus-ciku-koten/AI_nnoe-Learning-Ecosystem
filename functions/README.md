# Archived Firebase Functions

This directory is retained only as an inert source inventory while the
application cutover is unresolved. The active application must not invoke or
deploy these Firebase Functions. Do not use the Firebase CLI, Firebase Admin
SDK, Firebase emulators, Firebase Secret Manager, or Google Cloud deployment
commands for this project.

The active web application uses Supabase Auth and local Supabase Edge Function
implementations where available. Hosted Supabase feature schemas, Edge
Functions, and data reconciliation remain incomplete; this does not prove that
the deployed Firebase services have been stopped or replaced.

Legacy endpoints still present in this directory include authentication and
platform administration, AI provider settings/generation, Canva OAuth,
Midtrans checkout/webhooks, chat notifications, and protected media. Their
source and tests are not evidence of current hosted deployment, traffic, or
feature parity. Do not delete or deploy them in this step; keep them only for
later source-level reconciliation, without invoking Firebase.

For an operational application, use only the active web scripts:

```powershell
npm --prefix web test
npm --prefix web run build
```

Do not set Firebase project secrets, billing, Blaze, or external provider
credentials. Any future migration must keep the zero-billing constraint, use
an owner-approved recovery plan, and avoid Firebase access as requested.
