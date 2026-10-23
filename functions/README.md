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
platform administration, AI provider settings/generation, Canva OAuth, chat
notifications, and protected media. The archived Midtrans checkout/webhook
implementations have been removed from this source tree. Supabase payment and
trial migrations remain as historical records; no hosted settings, functions,
secrets, accounts, or data were changed. Remaining legacy source is not
evidence of current hosted deployment, traffic, or feature parity. Do not
deploy these archived functions or invoke Firebase.

For an operational application, use only the active web scripts:

```powershell
npm --prefix web test
npm --prefix web run build
```

Do not set Firebase project secrets, billing, Blaze, or external provider
credentials. Any future migration must keep the zero-billing constraint, use
an owner-approved recovery plan, and avoid Firebase access as requested.
