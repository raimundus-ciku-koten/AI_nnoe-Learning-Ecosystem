Deployment and Release Guide — AI_nnoe Learning Ecosystem

Overview

This document records the release state and the remaining safe rollout steps for AI_nnoe Learning Ecosystem.

Current release status:
- The active web UI now has no public signup/trial form, checkout/payment flow, or ad integration. Login remains available to provisioned users. The public login and package pages show catalog prices and link to the owner’s WhatsApp (`+6282236267895`). This code change did not alter hosted Auth settings, functions, database records, or deployments.
- **Production login access restored on 2026-10-22:** PR #7 (`832d04d`) restored the web application source to `main`; Vercel deployed the recovery. An anonymous check confirmed `https://ainnoe-le.vercel.app/#/login` renders the login page and the domain returns HTTP 200. The outage observed on 2026-10-21 was resolved without Instant Rollback. This is a login-only recovery, not confirmation that every feature module is ready.
- The restored login page displays email/password and Google sign-in controls, with no public trial/signup controls. No credentials were entered, no signup was submitted, and no hosted database migration was applied. The Staging dump restored successfully before encryption, but the uploaded ciphertext still needs its own decrypt/restore check; schema/provenance and CAPTCHA blockers remain.
- Production Supabase Auth has the email and Google providers enabled, while “Allow new users to sign up” is disabled. The three accounts in the separately supplied account document are present, confirmed, and not banned. One has a prior sign-in; two have no recorded sign-in, so their credentials still require owner-run sign-in verification.
- The supplied account document contains plaintext password fields. Keep it out of source control and rotate those passwords through the account provider before reuse.
- Older trial/signup rollout notes below are historical. The current local UI has no public signup/trial form; do not restore one without explicit owner approval and a separately reviewed Auth/security plan.
- The privileged MFA gate is updated in source so passive checks and retries are read-only; they no longer remove pending TOTP factors or enroll automatically. A pending factor is recognized across reloads, and replacing it requires a confirmation that removes only that unverified factor. This local change is not deployed.
- The latest security fix restores active-profile, allowed-role, non-demo, and AAL2 requirements in `current_user_is_active()`. The invitation Edge Function now verifies JWT claims and requires AAL2 before using service-role admin operations. Commit `2765cbd1` is included in PR #4, which merged to `migration/supabase-foundation-preview` on 2026-10-20. Focused MFA tests, the web build, GitHub CI, and Vercel Preview passed. These changes are not deployed to Production.
- The owner has now completed TOTP verification in the local application. The shared signed-in page displays the Super Admin dashboard and main navigation, confirming that the local MFA gate is open. Do not copy or share the QR, secret, or OTP. Production deployment still uses the older gate and remains separate from this successful local verification.
- Until the MFA gate fix is deployed, do not restart MFA setup through the current Production build while an enrollment is pending: the deployed gate automatically removes unverified TOTP factors before creating another one. The local app now displays the Super Admin menu, so avoid restarting enrollment unless MFA is explicitly reset by the owner.
- The Supabase organization is on the Free plan. Production `Ainnoe LE` (`jvcrmzmuxgyuetkjqady`) and `Ainnoe LE Staging` (`samszhfyhbjuculrcffg`) are both in `ap-south-1`. The Staging Dashboard confirmed on 2026-10-21 that the Free plan does not include scheduled project backups; the owner declined R2 due to potential charges. Manual workflow run #12 (`40087589412`) on 2026-10-24 successfully dumped Staging, restored the plaintext dump into a disposable Supabase PostgreSQL 17.11 database, detected 47 user tables, and uploaded the encrypted artifact. This validates the dump before encryption; the uploaded ciphertext itself has not yet been downloaded, decrypted, and restored. Artifact retention is one day, so it is not a durable recovery copy. This design reduces exposure and storage use but does not guarantee zero cost; check Actions storage usage and billing limits before triggering future runs.
- The Actions secrets pages were inspected without reading secret values. The manual Staging backup workflow requires only `SUPABASE_DB_URL` and `BACKUP_ENCRYPTION_KEY`, entered directly in GitHub Actions settings; never send them through chat or commit them. The DB URL is checked against the configured Staging project and the workflow refuses to run from any branch other than `main`. Run #12 uploaded artifact `supabase-staging-encrypted-40087589412` (352,895 bytes; SHA-256 `c8cb1fd888833e4c0f3a8b3f0f08c0a64488645f8698b106bf257fc333f68c5b`), which expires 2026-10-25 10:53:43 UTC.
- Supabase CAPTCHA protection is currently disabled. A Turnstile widget and server-side CAPTCHA validation have not been verified.
- A fresh read-only Staging catalog check was run in the Dashboard SQL Editor on 2026-10-24. It found eight public base tables: `platform_audit`, `platform_control`, `platform_public_config`, `profiles`, `school_registration_requests`, `tenants`, `trial_registrations`, and `user_allowlist`; RLS is enabled on all eight, with nine public policies. Of the 30 expected feature relations listed by the current inventory query, only `trial_registrations` exists. `supabase_migrations.schema_migrations` is absent, so hosted migration provenance cannot be established. The legacy `school_registration_requests` still has the incompatible hosted shape and a policy tied to `user_id`; the checked-out migration directory has no matching school-registration migration. It also currently ends at `20261019000200_public_demo_trial.sql` and contains neither the documented `school_registration_requests_v2` migration nor a privacy-consent migration. The inventory read schema metadata only; it did not inspect application rows or mutate the database. The 2026-10-21 detailed comparison remains historical; the 2026-10-24 check was limited to relations, columns, RLS policies, migration-history presence, and expected-relation presence. Reconcile the actual migration source and perform a full definition-level comparison before any hosted migration. The other rollout migrations (price catalog, active-profile check, private AI credentials, and random attendance tokens) are not validated in Staging or Production. Although Midtrans business review was previously reported in progress, billing remains intentionally disabled under the no-billing requirement. AdSense has no registered sites; ads remain disabled, and the published `ads.txt` does not establish approval or activate ads.
- A fresh isolated anonymous Production browser check on 2026-10-20 showed the login page without a visible trial CTA; the login and pricing JavaScript/CSS assets returned HTTP 200. The Production Auth dashboard also confirmed “Allow new users to sign up” is disabled and CAPTCHA protection is disabled. A previously shared warm browser tab showed stale trial UI, which did not reproduce in the clean context. No credentials were entered and no signup was submitted. Keep public trial registration disabled until CAPTCHA is enabled and validated server-side. The previously shared Preview page recorded Turnstile error `300030`; treat Preview signup as unverified and keep it disabled.
- PR #4 (`Fix safe privileged MFA enrollment and release readiness`) merged from `fix/login-only-public-release` into `migration/supabase-foundation-preview` on 2026-10-20. Its description records the MFA/security changes and rollout blockers. The merge did not target `main` and did not deploy to Production.

Historical read-only Staging re-check on 2026-10-21:
`information_schema.tables` lists eight public base tables:
`platform_audit`, `platform_control`, `platform_public_config`, `profiles`,
`school_registration_requests`, `tenants`, `trial_registrations`, and
`user_allowlist`. Compared with the 36 expected feature relations in
`supabase/audit_hosted_schema.sql`, only the legacy
`school_registration_requests` and `trial_registrations` exist; the other 34,
including `school_registration_requests_v2`, are missing.
`to_regclass` confirms both `public.school_registration_requests_v2` and
`supabase_migrations.schema_migrations` were absent at the time of this audit.
These checks read schema metadata only; no application rows were queried and
no database changes were made. The SQL Editor query was left unsaved. Backup
and disposable restore evidence was subsequently obtained in workflow run #12
on 2026-10-24. Hosted migration remains blocked pending an updated schema and
migration-provenance review, verification of the uploaded encrypted artifact,
and an explicit migration approval.

## Uploaded recommendation documents — implementation status (2026-10-21)

This status compares the five uploaded documents with the current local source. “Implemented” means there is a code path in this repository; it does not prove that a hosted migration, provider setting, legal review, accessibility audit, load test, or production rollout has occurred.

- **Informasi harga dan kontak:** Public login and the authenticated price page display annual catalog prices, monthly equivalents, and a direct WhatsApp link to the owner. Links open a user-initiated inquiry only; the app does not collect registration details, create orders, or process payments.
- **Masukan Lanjutan Optimalisasi dan Profesionalitas Platform:** Partially implemented. Online exam answers can be drafted locally and retried with a server idempotency ID; grading keys and deadlines are server-side. The planning RPE now records JP per weekday and Prosem uses the actual remaining weekly capacity when holidays occur. However, student/parent no-login links, encrypted preloaded exam packages and seeded question shuffling, accommodation/re-entry workflows, automated cross-tenant RLS integration tests, load testing for 1,500 concurrent starts, uptime/keep-alive and quota alerts, incident runbooks, vendor failover, and a public service-status process are not verified or complete. Payment processing is intentionally disabled; payment-webhook and paid-entitlement recommendations remain deferred until a separately approved no-billing/business decision.
- **Panduan Akun Google Pengguna, Scope OAuth, dan Praktik Profesional (Tanpa Billing):** Partially implemented. Google Workspace authorization is user-triggered in the browser, uses Drive file access and the Meet-created-space scope where needed, and keeps short-lived access tokens in page memory rather than persisting refresh tokens. AI defaults to local WebLLM models; optional user-owned API keys can incur provider fees and are not a zero-cost guarantee. AI workflows remain controlled by superadmin feature flags, and payment processing remains disabled. OAuth consent-screen verification and real `belajar.id` administrator compatibility still require owner-run checks. The projects remain in `ap-south-1`, not Singapore; no region move is approved. Staging backup run #12 restored the dump before encryption; end-to-end restore of the uploaded ciphertext and a recurring quarterly restore drill remain outstanding, so hosted migrations remain blocked.
- **Pedoman Ciri Tampilan Aplikasi Pendidikan Web dan Mobile:** Partially implemented. The app has responsive layouts, labeled form controls, a skip-to-content link, visible focus treatments, reduced-motion handling in shared components, and accessible status messaging in many flows. A Lighthouse mobile audit of the anonymous local login page on 2026-10-21 scored Accessibility 100; this is a single-page automated result, not a repository-wide WCAG 2.2 AA audit. The same run flagged a missing/recommended `llms.txt` for agentic browsing, which is not an accessibility failure. Keyboard/screen-reader testing, 200% zoom and 320px reflow verification, color-contrast measurements, Core Web Vitals targets, and representative low-end Android/WebView testing remain outstanding. Do not claim conformance until those checks pass.
- **Skema Pemanfaatan AI pada Menu Perencanaan Guru AI-nnoe:** Partially implemented. RPE/Prota/Prosem calculations are deterministic; CP import is teacher-selected, and ATP/KKTP/module data use structured validation and encrypted Drive revisions. RPE weekday allocations now account for holidays at daily granularity, and existing packages without that field are read compatibly. Browser AI defaults to local WebLLM models, with optional personal API keys for external providers; provider use may incur user-side charges. The generic planning generator is not yet connected to encrypted curriculum context. Full prompt/version/golden-set operation, a shared guided stepper and single active context, the student-facing module flow, and all acceptance criteria in the proposal are not complete. Do not represent the proposed end-to-end AI workflow as available.

### Required work before claiming full alignment

1. Keep public signup and all hosted schema changes disabled until a reviewed account/child-consent design is approved, the uploaded encrypted backup is restored to a disposable environment, and current Staging schema/migration provenance is reconciled. WhatsApp is available for package inquiries only; no account-registration intake is provided.
2. Complete an itemized acceptance review for the five documents, including student/parent access design, privacy/retention and subprocessor/legal review, OAuth verification, RLS isolation tests, exam integrity/load testing, and WCAG/device testing.
3. Enable only features that have a tested implementation and an owner-approved operational plan. External provider credentials, paid plans, production settings, and legal attestations cannot be inferred from local source or configured on the owner’s behalf.

Do NOT apply database migrations to hosted Supabase until the encrypted artifact restore, current Staging schema/provenance review, and migration-specific approval are complete.

1) Pull request and release branch

- GitHub currently reports PR #1 (`chore: establish staged Supabase migration foundation`) open against `main`, and PR #2 (`Add secure 3-day demo trial and align Indonesian pricing`) closed without merge. PR #3 with the same trial-release scope was merged into `migration/supabase-foundation-preview`. `main` remains unchanged.
- PR #1's Web CI and Vercel checks now pass. The original Preview build failed because `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` were not configured for Preview; after both variables were confirmed in Preview, the same PR commit was redeployed successfully and its login page was smoke-tested anonymously. PR #1 remains open against `main`; its foundation commit is already an ancestor of `migration/supabase-foundation-preview`. Do not merge PR #1 to `main` until account/data migration, Staging schema/RLS validation, Auth redirects, and recovery/rollback prerequisites are complete.
- The login-only hotfix was redeployed from commit `f616440b` with Vercel's Production environment. The Staging Preview was not promoted. Do not treat Preview environment values as Production values.
- Keep the trial migration source-only until the backup, staging, and approval requirements below are satisfied.
- The owner reports that the AI provider and Canva OAuth secrets are configured server-side. Do not request or copy their values; provider calls still need an authenticated Staging smoke test.
- Superadmin navigation is driven by the server-authorized role claim, not by a client-side email check. The verified-owner bootstrap is in `supabase/migrations/20261016000400_verified_superadmin_bootstrap.sql`. A read-only check of the signed-in Production owner on 2026-10-20 confirmed `profiles.role = superadmin`, `profiles.active = true`, and JWT `app_metadata.role = superadmin`, `active = true`. After the owner completed TOTP verification, the shared local application displayed the Super Admin dashboard and navigation. No role grant is indicated. Do not grant Superadmin in frontend code.

2) CI / Build verification

- The repository includes `web/package.json` scripts for build and test. Locally run:
  - npm --prefix web run build
  - npm --prefix web test
- The GitHub Actions web CI also type-checks the new Supabase Edge Functions with Deno. The build, tests, and Edge Function checks must pass on the release PR.
- The unused `skillui` development dependency was removed because it introduced vulnerable transitive tooling. On 2026-10-21, `npm audit --prefix web` reported zero vulnerabilities across production and development dependencies.

3) Supabase migration policy (CRITICAL, manual step)

DO NOT run migrations on production until ALL of the following are true:
  - A complete, verified backup of the hosted database exists and has been tested for restore.
  - A staging Supabase instance is prepared with the current production schema applied, where this migration can be executed and validated.
  - The owner/administrator explicitly approves the migration (written sign-off).

Backup checklist:
  - Use Supabase Console "Backups" to create a backup and download it OR use `pg_dump` from a trusted machine that can access the DB (service_role or DB credentials).
  - Verify the backup file can be restored into a local or staging Postgres instance.

Applying migrations (recommended workflow):
  1. Use the existing disposable staging project and verify that it matches the intended Production schema without copying production user data.
  2. Apply the migration SQL files (in `supabase/migrations/`) in order using the SQL Editor or `psql`.
  3. Run the full test suite (local and any DB-focused integration tests) against staging.
  4. After sign-off, apply migrations to production during a maintenance window.

The checkout also contains the new menu-access and integration-consent
migrations `20261025000300_superadmin_user_menu_access.sql` and
`20261025000400_user_integration_consent.sql`. They have not been applied or
verified on a hosted database. The private frontend now fails closed if it
cannot load these policies, so deploy the migrations through the approved
staging and release process before deploying this frontend. Do not bypass the
database gate or treat client-side menu hiding as backend authorization.

The trial migration `supabase/migrations/20261019000200_public_demo_trial.sql` creates `trial_registrations` and writes `trial_expires_at`. Staging has a table with that name, but no migration history exists, so its provenance and parity with this migration are unknown. The migration is append-only but modifies `public.provision_auth_profile()` and `public.custom_access_token_hook()` logic; audit those functions carefully in Staging. The additional migrations `20261019000100_indonesia_price_catalog.sql`, `20261019000300_live_profile_active_check.sql`, `20261019000400_private_ai_credentials.sql`, and `20261019000500_random_attendance_tokens.sql` have not been verified in Staging or Production.

Current blocker: the manual Staging backup workflow on `main` completed run #12 on 2026-10-24. It restored the generated plaintext dump to a disposable database before encryption and uploaded the encrypted artifact; the artifact itself has not been decrypted and restored. The artifact expires after one day, so retain a durable recovery copy only through an approved, no-cost process. A limited read-only catalog check on 2026-10-24 confirmed the eight public relations, RLS/policies, missing migration-history table, and missing feature relations, but did not perform a complete definition-level comparison with source migrations. The checked-out source also does not contain every migration referenced by older release notes. Do not apply any hosted migration until a full catalog inventory is reconciled with the actual migration source, a recovery artifact is verified, and the owner explicitly approves the specific migration. Do not use Production as a substitute for Staging.

Historical read-only Staging Dashboard inspection on 2026-10-20 showed “Run your first migration” under Database → Migrations. The 2026-10-21 inventory and its proposed non-destructive v2 approach are historical; the current checkout does not contain that v2 migration, so its source and prior validation must be located before relying on those notes. The 2026-10-24 read-only catalog check still found no migration history and only one of 30 expected feature relations. No hosted SQL that changes data or schema was run. Backup restore validation was later completed for the plaintext dump before encryption, but the uploaded ciphertext, schema provenance, and migration sources remain unresolved.

7) Attendance rollout aligned with the school attendance guide

- QR/barcode remains the active attendance method. New cards print a QR link to the authenticated scan page and retain a Code128 option for dedicated scanners. The link carries only a cryptographically random opaque token, not class, NISN, or a student name.
- Existing printed cards remain valid during the compatibility rollout. Existing legacy codes can contain the class and the last four NISN digits; replace/reissue those cards before claiming all school cards meet the token-only privacy rule. Do not rotate them in bulk without a school-approved reprint plan.
- The scan confirmation shows only the student's first name and does not display NISN or the card token. Attendance remains teacher-authenticated and scoped by Supabase RLS.
- Face recognition is not implemented or enabled. Do not collect/store face images or embeddings until a separately approved volunteer pilot has written consent, a non-biometric QR/manual alternative, tested liveness/anti-spoofing, access controls, retention/deletion rules, and an evaluated on-device design.
- Offline queueing, manual correction with reason/audit trails, device-level scan audit, and attendance-pattern alerts are not yet available. Do not advertise these as release features; add and validate them as separately scoped work before relying on those controls.
- Apply `20261019000500_random_attendance_tokens.sql` only through the documented backup, staging parity, validation, and approval process. This migration permits new random tokens while preserving legacy tokens; it does not rewrite existing student records.

The staging database password was generated in Supabase during project creation and was not copied into this repository or chat. If direct database access is later needed for CLI migrations or backup/restore, reset it in Supabase and store the replacement in an approved password manager.

4) Environment variables (Vercel / Hosting)

Set these environment variables in Vercel (Project Settings → Environment Variables) for the Preview and Production environments. Use values from your Supabase console and external services, stored as project-level secrets (NOT in repo):

- VITE_SUPABASE_URL — Supabase HTTP URL (anon client uses only public-safe keys)
- VITE_SUPABASE_ANON_KEY — Supabase anon/publishable key (frontend)
- VITE_TURNSTILE_SITE_KEY — Cloudflare Turnstile site key (frontend)
- Turnstile secret: configure only in Supabase Auth CAPTCHA settings; never store it in Vercel or frontend environment variables.
- VERCEL_TOKEN — (only if automating deployments via CLI in scripts)
- Never put service-role keys, payment credentials, AI provider keys, or OAuth client secrets in the frontend/Vercel web environment.

For local Staging work, run `npm run dev:staging` from `web`. This uses the
isolated `web/env/staging/.env.staging` profile and does not load the root
`web/.env.local` Production configuration. Obtain the Staging anon/publishable
key from the Staging Supabase project and place it in
`web/env/staging/.env.staging.local`; that local file is ignored by Git. Do
not copy a Production key into the Staging profile. Public Auth signup is
disabled in local Supabase configuration. The owner WhatsApp number is public
application data and is included in the visible frontend bundle.

Starting the app with this profile does not verify Staging schema parity,
backup/restore, authentication providers, or deployment readiness. Do not
apply migrations or submit real user data as part of this setup.

Important:
- The frontend must never receive service_role or other server secrets.
- Do not configure Midtrans secrets, ad publisher IDs, or ad units; payments and advertising are outside the zero-billing configuration described here.
- The public price list uses `functions/shared/pricing.json`; monthly equivalents use its configured divisor. The owner WhatsApp number is intentionally public in `web/src/services/publicPricing.js`. Update it only after owner confirmation.
- After staging exists: create a dedicated Managed Cloudflare Turnstile widget for the exact Vercel Preview hostname(s) used for staging; configure its site key and secret in the staging Supabase Authentication → Attack Protection → CAPTCHA protection settings; and add only the public site key as `VITE_TURNSTILE_SITE_KEY` to Vercel Preview. Do not use a broad `*.vercel.app` hostname allowlist. Validate missing, invalid, and expired tokens before any Production rollout.
- After staging validation and written approval, create a separate Turnstile widget restricted to `ainnoe-le.vercel.app`, configure its key pair in Production Supabase, add the public site key to Vercel Production, redeploy, and verify the live signup flow. Never store or expose the Turnstile secret in Vercel, source control, chat, or a frontend build.
- The current local UI has no public signup/trial form. Turnstile is relevant only if a future, explicitly approved signup flow is designed; do not add the frontend site key as part of this release.
- The school-registration submission path calls the `school-registry` Supabase Edge Function, which verifies the caller's confirmed user and checks the Ministry registry before using the service role to submit a v2 request. `supabase/config.toml` requires JWT verification for this function. Deploy it only after the v2 schema has been reviewed and safely applied to a disposable/Staging database; never grant browser clients direct execute access to the v2 submit RPC.

5) Billing and payments

- The application operates without in-app billing. Do not implement, configure, or deploy Midtrans checkout or payment processing under this requirement.
- The local `midtrans-checkout` and `midtrans-webhook` Edge Functions return HTTP 410 for non-preflight requests. Keep them fail-closed; do not add gateway calls, secrets, or service-role access.
- The `finalize_midtrans_payment()` routine and billing migrations are retained historical/local schema artifacts, not authorization to activate payments. Do not apply them to a hosted project as part of ordinary setup.
- Do not create payment orders, collect payment credentials, test with real payments, or enable a billing provider. Entitlement display, if schema is present, is informational only.
- A future change to this policy requires explicit owner approval, review of provider fees and hosted schema, and a separate deployment plan.

6) Advertising

- Advertising is not part of the zero-billing application. Keep AdSense/AdMob scripts, publisher IDs, and ad units disabled; do not add them as a deployment step.
- A static `ads.txt` or `app-ads.txt` file does not enable ads and is not evidence of account approval. Do not configure a publisher account or payment profile under this requirement.
- AdMob requires a native Android application and SDK; the current Android project is a Trusted Web Activity. Do not add an SDK or release an ad-supported build.

7) Building the Android APK / AAB

Prerequisites (local machine or CI runner):
- JDK 17+, Android SDK, Android Build Tools, Gradle wrapper provided by the project (if Android project is present)
- Signing key (keystore file) and the signing properties
- Digital Asset Links configuration for your domain (if using TWA) — requires the assetlinks.json hosted on the site under `/.well-known/assetlinks.json`.

If you want a quick unsigned/dev build (NOT for Play Store):
- Open the Android project and run `./gradlew assembleDebug` (or use the project's documented script).

For a Play Store release (recommended):
- Prepare a release keystore (keystore.jks) and keep it secret.
- Set up `keystore.properties` with password and alias (never commit these to the repo).
- Run `./gradlew bundleRelease` to generate an AAB, sign it with your keystore, and verify with `apksigner`.

A signed APK candidate already exists at `android-apk/app/build/outputs/apk/release/app-release.apk`. It targets `ainnoe-le.vercel.app`; the production Digital Asset Links endpoint is live and matches its signing fingerprint. Treat it as a candidate, not a Play Store release, until store listing, legal details, and release review are complete.

8) Post-deploy checks

- After deploying preview or production, verify:
  - The public login page loads and unauthenticated routes remain restricted.
  - No public signup or trial form is present; local Supabase Auth signup is disabled. Hosted Auth configuration must be checked separately and has not been changed here.
  - `https://ainnoe-le.vercel.app/.well-known/assetlinks.json` returns HTTP 200 with the APK package and signing fingerprint.
  - Superadmin allowlist entries work and the supplied emails can set passwords via the password setup flow.
  - After provider configuration is verified, demo accounts can sign up and are limited to `/trial` and in-browser simulation only.
  - Public and authenticated package pages show catalog prices and owner WhatsApp contact only; no order, checkout, or payment action exists.

9) Rollout & privacy

- The selected policy is to keep the email record while the service operates, to prevent another trial with the same address. The final privacy process must provide a way to submit a verified erasure request; deleting the record permits that address to register for another trial. Publish registration only after the controller identity, privacy contact, and request process are in place.
- Add final legal contact and privacy-controller details to `/privacy` before inviting students or processing sensitive data.

10) Remaining rollout steps
- Preserve the legacy `school_registration_requests` table and RPCs; review the non-destructive `school_registration_requests_v2` migration and versioned API, validate it in a disposable environment first, then re-audit Staging schema parity without copying Production user data. Verify a restorable Production backup before any Production migration.
- Resolve the release PR/source-branch discrepancy: PR #2 is closed unmerged, so confirm the intended code branch and merge/deploy path before claiming the trial feature is part of a merged release.
- Keep public signup and trial registration removed. A future signup workflow requires separate explicit approval and a reviewed server-side security design.
- Deploy the MFA gate fix through the approved release path, then have the administrator explicitly enroll or verify their own TOTP factor and confirm a fresh session reaches AAL2. Never request or handle the authenticator QR, secret, recovery code, or one-time code.
- Verify the staging schema, backup, and restore process before applying any hosted migrations; production migration still requires explicit approval.
- Keep payment processing and advertising disabled under the no-billing requirement.
- Publish the privacy contact and verified email-erasure process before inviting students or processing real school data.

11) Local AI, personal API keys, and Canva integrations

- WebLLM with local Qwen is the default AI option; Llama is an opt-in larger local model. Model downloads start only after a user action and require WebGPU. Optional Gemini, DeepSeek, and Groq keys are provided by users, held only in tab memory, and used only after a disclosure acknowledgement and explicit provider selection. Prompts are sent directly to the selected provider and may incur user-side fees; this is not a zero-cost guarantee. Do not configure shared provider keys or deploy legacy AI functions. Superadmin feature controls gate AI workflows.
- Canva integration is not part of the active no-billing release. Do not configure OAuth secrets or deploy Canva functions. The current application does not create or edit Canva designs.
- The presence of historical migrations, source code, or provider configuration in this repository does not establish hosted deployment or feature availability.

---

Never send passwords, API keys, or other secrets in chat. Configure them directly in the provider dashboards or as deployment secrets.
