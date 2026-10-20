Deployment and Release Guide — AI_nnoe Learning Ecosystem

Overview

This document records the release state and the remaining safe rollout steps for AI_nnoe Learning Ecosystem.

Current release status:
- The login-only hotfix `f616440b` is deployed as a new Vercel Production deployment from the Production environment. The Preview deployment was not promoted because it uses Staging environment values.
- The Production site and login page load anonymously. The email/password and Google sign-in controls are present; trial/signup controls are not shown. The primary JavaScript and CSS assets and `/.well-known/assetlinks.json` return HTTP 200.
- Production Supabase Auth has the email and Google providers enabled, while “Allow new users to sign up” is disabled. The three accounts in the separately supplied account document are present, confirmed, and not banned. One has a prior sign-in; two have no recorded sign-in, so their credentials still require owner-run sign-in verification.
- The supplied account document contains plaintext password fields. Keep it out of source control and rotate those passwords through the account provider before reuse.
- Trial registration remains disabled. Any future trial/signup release requires Turnstile to be configured and verified server-side by Supabase Auth.
- The privileged MFA gate is updated in source so passive checks and retries are read-only; they no longer remove pending TOTP factors or enroll automatically. A pending factor is recognized across reloads, and replacing it requires a confirmation that removes only that unverified factor. This local change is not deployed.
- The owner has now completed TOTP verification in the local application. The shared signed-in page displays the Super Admin dashboard and main navigation, confirming that the local MFA gate is open. Do not copy or share the QR, secret, or OTP. Production deployment still uses the older gate and remains separate from this successful local verification.
- Until the MFA gate fix is deployed, do not restart MFA setup through the current Production build while an enrollment is pending: the deployed gate automatically removes unverified TOTP factors before creating another one. The local app now displays the Super Admin menu, so avoid restarting enrollment unless MFA is explicitly reset by the owner.
- The Supabase organization is on the Free plan. Production `Ainnoe LE` (`jvcrmzmuxgyuetkjqady`) and `Ainnoe LE Staging` (`samszhfyhbjuculrcffg`) are both in `ap-south-1`. On 2026-10-20, the owner confirmed that Production backup/restore was verified and gave written approval for the reviewed migration. The backup artifact and restore evidence have not been independently inspected here. The read-only Staging inventory still shows an incomplete schema; no rollout migration was run during this workspace session.
- Supabase CAPTCHA protection is currently disabled. A Turnstile widget and server-side CAPTCHA validation have not been verified.
- Staging has no registered migration versions. Its read-only inventory found the `trial_registrations` table, but this alone does not prove which migration created it or whether that migration is complete. The other new rollout migrations (price catalog, active-profile check, private AI credentials, and random attendance tokens) are not validated in Staging or Production. Midtrans business review is in progress. AdSense has no registered sites yet; `ads.txt` is published, but ads are not active.
- A fresh isolated anonymous Production browser check on 2026-10-20 showed the login page without a visible trial CTA; the login and pricing JavaScript/CSS assets returned HTTP 200. The Production Auth dashboard also confirmed “Allow new users to sign up” is disabled and CAPTCHA protection is disabled. A previously shared warm browser tab showed stale trial UI, which did not reproduce in the clean context. No credentials were entered and no signup was submitted. Keep public trial registration disabled until CAPTCHA is enabled and validated server-side. The previously shared Preview page recorded Turnstile error `300030`; treat Preview signup as unverified and keep it disabled.
- Draft PR #4 (`Fix safe privileged MFA enrollment and release readiness`) is open from `fix/login-only-public-release` to `migration/supabase-foundation-preview`. The initial Web CI check passed, another PR CI run is in progress, and the latest Vercel status for the branch is successful Preview only. Preview does not promote or deploy to Production. Keep the PR in draft until schema reconciliation and release review are complete.

Do NOT apply database migrations to hosted Supabase until backups and a staging verification are complete.

1) Pull request and release branch

- GitHub currently reports PR #1 (`chore: establish staged Supabase migration foundation`) open against `main`, and PR #2 (`Add secure 3-day demo trial and align Indonesian pricing`) closed without merge. PR #3 with the same trial-release scope was merged into `migration/supabase-foundation-preview`. `main` remains unchanged.
- PR #1's Web CI checks pass, but its Vercel deployment check is failing; inspect that deployment before merging. The `fix/login-only-public-release` branch is based on `migration/supabase-foundation-preview` and is ahead of it, with no commits behind the Preview base. It is submitted as draft PR #4 targeting the Preview foundation branch; do not target `main` while the foundation PR is unresolved.
- The login-only hotfix was redeployed from commit `f616440b` with Vercel's Production environment. The Staging Preview was not promoted. Do not treat Preview environment values as Production values.
- Keep the trial migration source-only until the backup, staging, and approval requirements below are satisfied.
- The owner reports that the AI provider and Canva OAuth secrets are configured server-side. Do not request or copy their values; provider calls still need an authenticated Staging smoke test.
- Superadmin navigation is driven by the server-authorized role claim, not by a client-side email check. The verified-owner bootstrap is in `supabase/migrations/20261016000400_verified_superadmin_bootstrap.sql`. A read-only check of the signed-in Production owner on 2026-10-20 confirmed `profiles.role = superadmin`, `profiles.active = true`, and JWT `app_metadata.role = superadmin`, `active = true`. After the owner completed TOTP verification, the shared local application displayed the Super Admin dashboard and navigation. No role grant is indicated. Do not grant Superadmin in frontend code.

2) CI / Build verification

- The repository includes `web/package.json` scripts for build and test. Locally run:
  - npm --prefix web run build
  - npm --prefix web test
- The GitHub Actions web CI also type-checks the new Supabase Edge Functions with Deno. The build, tests, and Edge Function checks must pass on the release PR.
- Workspace design analyzer `skillui@1.3.4` is a development-only dependency and is not bundled into the web application. The owner accepted its unresolved dependency advisories for local use; do not run `skillui --repo` on untrusted repositories. The production dependency audit (`npm audit --omit=dev`) currently reports zero vulnerabilities, while the full development dependency audit still reports four advisories (two critical, one high, one low).

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

The trial migration `supabase/migrations/20261019000200_public_demo_trial.sql` creates `trial_registrations` and writes `trial_expires_at`. Staging has a table with that name, but no migration history exists, so its provenance and parity with this migration are unknown. The migration is append-only but modifies `public.provision_auth_profile()` and `public.custom_access_token_hook()` logic; audit those functions carefully in Staging. The additional migrations `20261019000100_indonesia_price_catalog.sql`, `20261019000300_live_profile_active_check.sql`, `20261019000400_private_ai_credentials.sql`, and `20261019000500_random_attendance_tokens.sql` have not been verified in Staging or Production.

Current blocker: the owner reports Staging and backup restore are ready, but this workspace cannot independently verify the restore artifact because Supabase CLI access is not configured. Before applying the source-only migrations, resolve the incomplete hosted schema. Do not use Production as a substitute for staging.

Read-only Staging Dashboard inspection on 2026-10-20 showed “Run your first migration” under Database → Migrations. A SELECT-only inventory then found eight public tables (`platform_audit`, `platform_control`, `platform_public_config`, `profiles`, `school_registration_requests`, `tenants`, `trial_registrations`, and `user_allowlist`), but `supabase_migrations.schema_migrations` does not exist. Of the 32 feature tables enumerated in `supabase/audit_hosted_schema.sql`, only `trial_registrations` exists; the other 31, including core student, attendance, chat, billing, and AI tables, are missing. This indicates a partial or manually managed schema, not a clean database or proven migration parity. No SQL that changes data or schema was run. Keep `db push` and `migration repair` blocked until the entire schema and migration history are reconciled and the restore prerequisite is independently verified.

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
- SUPABASE_SERVICE_ROLE_KEY — (ONLY for server-side functions; never expose to client)
- VITE_TURNSTILE_SITE_KEY — Cloudflare Turnstile site key (frontend)
- Turnstile secret: configure only in Supabase Auth CAPTCHA settings; never store it in Vercel or frontend environment variables.
- VERCEL_TOKEN — (only if automating deployments via CLI in scripts)
- MIDTRANS_SERVER_KEY / MIDTRANS_CLIENT_KEY — use Midtrans sandbox keys for testing
- ADSENSE_PUBLISHER_ID, ADMOB_APP_ID — placeholders until accounts are approved

Important:
- The frontend must never receive service_role or other server secrets.
- Implement serverless functions (Edge Functions) as a proxy for Midtrans using server-side secrets.
- After staging exists: create a dedicated Managed Cloudflare Turnstile widget for the exact Vercel Preview hostname(s) used for staging; configure its site key and secret in the staging Supabase Authentication → Attack Protection → CAPTCHA protection settings; and add only the public site key as `VITE_TURNSTILE_SITE_KEY` to Vercel Preview. Do not use a broad `*.vercel.app` hostname allowlist. Validate missing, invalid, and expired tokens before any Production rollout.
- After staging validation and written approval, create a separate Turnstile widget restricted to `ainnoe-le.vercel.app`, configure its key pair in Production Supabase, add the public site key to Vercel Production, redeploy, and verify the live signup flow. Never store or expose the Turnstile secret in Vercel, source control, chat, or a frontend build.
- The current public build has no Turnstile widget and blocks trial registration when the site key is missing. Do not add the frontend site key until Supabase Auth is configured to validate Turnstile tokens server-side.

5) Midtrans integration (billing)

- Keep checkout disabled until you verify Midtrans sandbox behavior and the payment flow uses server-side verification.
- Midtrans business registration is currently under review; do not claim payments are enabled or add live credentials before approval.
- Implement an Edge Function / Supabase Function to call Midtrans server-side finalize endpoints using `MIDTRANS_SERVER_KEY`. The DB function `finalize_midtrans_payment()` is provided in migrations but must be executed only by `service_role` or via authenticated serverless functions.
- Test end-to-end with Midtrans sandbox credentials.

6) AdSense / AdMob

- AdSense requires account approval and site verification. Do not enable live ad units until AdSense approves the site.
- AdSense has no registered sites and remains in onboarding; `ads.txt` is published, but no live ads are enabled.
- Add `ads.txt` and `app-ads.txt` as required, but keep ad scripts disabled in the release until approval.
- For AdMob in an Android build, the app must be a real native app (AAB) and have a registered package name and signing key uploaded to the Play Console. Trusted Web Activity (TWA) is not sufficient for AdMob SDK.

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
  - Trial signup stays blocked until Turnstile is enforced and Supabase verifies tokens server-side.
  - `https://ainnoe-le.vercel.app/.well-known/assetlinks.json` returns HTTP 200 with the APK package and signing fingerprint.
  - Superadmin allowlist entries work and the supplied emails can set passwords via the password setup flow.
  - After provider configuration is verified, demo accounts can sign up and are limited to `/trial` and in-browser simulation only.
  - Billing pages show indicative pricing but checkout remains disabled until Midtrans is configured.

9) Rollout & privacy

- The selected policy is to keep the email record while the service operates, to prevent another trial with the same address. The final privacy process must provide a way to submit a verified erasure request; deleting the record permits that address to register for another trial. Publish registration only after the controller identity, privacy contact, and request process are in place.
- Add final legal contact and privacy-controller details to `/privacy` before inviting students or processing sensitive data.

10) Remaining rollout steps
- Bring the existing `Ainnoe LE Staging` project to verified Production schema parity without copying production user data; verify a restorable Production backup before any Production migration.
- Resolve the release PR/source-branch discrepancy: PR #2 is closed unmerged, so confirm the intended code branch and merge/deploy path before claiming the trial feature is part of a merged release.
- Configure Turnstile only after staging Auth is reachable, then validate server-side CAPTCHA enforcement and email redirects before enabling trial registration.
- Deploy the MFA gate fix through the approved release path, then have the administrator explicitly enroll or verify their own TOTP factor and confirm a fresh session reaches AAL2. Never request or handle the authenticator QR, secret, recovery code, or one-time code.
- Verify the staging schema, backup, and restore process before applying any hosted migrations; production migration still requires explicit approval.
- Wait for Midtrans business review and complete sandbox/webhook tests before enabling checkout.
- Complete AdSense site verification and policy approval before enabling ads.
- Publish the privacy contact and verified email-erasure process before inviting students or processing real school data.

11) AI provider and Canva rollout (source changes only)

- AI assistant and question-draft requests use the authenticated Supabase Edge Function `ai-user-services`. Teachers provide their own Gemini, DeepSeek, Groq, or Claude key; the browser never calls AI provider APIs directly. There is no platform-key fallback.
- Before allowing AI traffic, apply `supabase/migrations/20261019000400_private_ai_credentials.sql` to a verified staging database, then deploy `ai-user-services`, `canva-oauth-start`, and `canva-oauth-callback` to that same project. The backend enforces `platform_control.features.aiAssistant` and `aiGeneration` for assistant, question-generation, and provider-key verification requests.
- Configure `AI_CREDENTIALS_KEYRING` as a Supabase Edge Function secret. Its value is JSON shaped like `{"active":"v1","keys":{"v1":"<base64-encoded-32-byte-key>"}}`. Generate the 32-byte encryption key using an approved secure process and store it only in the secret manager. Do not paste it into chat, source control, Vercel, or browser variables. Preserve older key versions during key rotation until all credentials encrypted with them have been re-encrypted or removed.
- Canva OAuth additionally requires the server-side secrets `CANVA_CLIENT_ID`, `CANVA_CLIENT_SECRET`, `CANVA_REDIRECT_URI`, and `CANVA_APP_URL`. Register the exact callback URL `https://<project-ref>.supabase.co/functions/v1/canva-oauth-callback` in the Canva developer app and enable the requested `design:content:write` scope. `CANVA_APP_URL` must be the intended HTTPS application URL. Never expose the client secret or encryption key to the browser.
- The function configuration requires JWT verification for `ai-user-services` and `canva-oauth-start`; `canva-oauth-callback` is intentionally public for the OAuth redirect and validates a one-time, expiring server-side state before accepting the authorization code.
- The AI settings page discloses provider processing and possible fees. Verifying a submitted key makes a small provider request; a free quota or continued model availability is not guaranteed. AI keys are encrypted at rest and are used only for the owner's requests.
- Canva support in this release is limited to connecting and disconnecting an account (including remote token revocation). Creating or editing Canva designs from the application is not implemented. The planning-document AI generator is also not connected to this backend yet; do not advertise either capability as available.
- The AI settings, authenticated assistant, and question-draft flows are wired to these functions in source. The provider IDs have been checked against current provider documentation. The owner reports that provider secrets are configured in the dashboard, but provider requests have not yet been validated in Staging. Planning-document generation and Canva design creation/editing remain unavailable and must not be advertised.
- These migration and function changes are not deployed to Staging or Production. Follow the backup, schema-parity, staging-validation, and written-approval requirements in section 3 before any hosted migration or Production rollout. Verify the four AI providers, account isolation, disabled-feature behavior, Canva connect/disconnect, and OAuth error paths in Staging first.

---

Never send passwords, API keys, or other secrets in chat. Configure them directly in the provider dashboards or as deployment secrets.
