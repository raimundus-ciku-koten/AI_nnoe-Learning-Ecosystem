Deployment and Release Guide — AI_nnoe Learning Ecosystem

Overview

This document records the release state and the remaining safe rollout steps for AI_nnoe Learning Ecosystem.

Current release status:
- Production is publicly available at `https://ainnoe-le.vercel.app/`. The live deployment includes the curriculum guidance update and Google OAuth callback fix; the site, login page, and APK Digital Asset Links endpoint return HTTP 200.
- Google OAuth is enabled in Production Supabase and was verified by completing a Google login through to the dashboard.
- The production site and login page load anonymously. `/.well-known/assetlinks.json` returns HTTP 200 and its package name and signing fingerprint match the repository configuration and signed APK candidate. The trial signup form is visible, but registration must remain blocked until Turnstile is configured and verified server-side.
- Trial registration is intentionally unavailable until Turnstile is configured and verified server-side by Supabase Auth. The form fails closed while its site key is missing.
- The Supabase organization is on the Free plan. Production `Ainnoe LE` (`jvcrmzmuxgyuetkjqady`) and `Ainnoe LE Staging` (`samszhfyhbjuculrcffg`) are both in `ap-south-1`. The staging project is still blank; no migrations have been applied or verified there. The dashboard session expired during the latest staging check.
- The owner reports that a Production backup and restore have been verified. Supabase confirms that managed scheduled backups are not included on the current Free plan; retain the independent backup and restore evidence before any migration.
- Supabase CAPTCHA protection is currently disabled. A Turnstile widget and server-side CAPTCHA validation have not been verified.
- Hosted Supabase migrations have not been applied. Midtrans business review remains unverified/pending. The signed-in AdSense account is in onboarding with no site registered; ads are not active. Cloudflare and Midtrans dashboards require an authenticated owner session to continue setup.
- The privacy page identifies AI_nnoe Corp and the owner-provided privacy contact. School processing basis, retention schedule, and legal review still need confirmation before real school/student data is used.

Do NOT apply database migrations to hosted Supabase until backups and a staging verification are complete.

1) Pull request and release branch

- PR #3 was merged into `migration/supabase-foundation-preview`; `main` remains unchanged. In the release repository, PR #2 (`Add secure 3-day demo trial and align Indonesian pricing`) is closed without being merged; its CI and Vercel preview checks passed, but that is not evidence that the changes were merged into the production source branch.
- The public production deployment was promoted from the Ready feature preview and rebuilt with the Production environment. Do not treat Preview environment values as Production values.
- Keep the trial migration source-only until the backup, staging, and approval requirements below are satisfied.

2) CI / Build verification

- The repository includes `web/package.json` scripts for build and test. Locally run:
  - npm --prefix web run build
  - npm --prefix web test
- The build and tests must pass in CI (GitHub Actions). If not present, add a job that runs `npm ci` and the above commands on PR updates.

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

The migration in this PR: `supabase/migrations/20261019000200_public_demo_trial.sql` creates `trial_registrations` and writes `trial_expires_at`. It is append-only but modifies `public.provision_auth_profile()` and `public.custom_access_token_hook()` logic. Audit these functions carefully in staging.

Current blocker: the staging project exists but is a blank database, not a clone of Production. Its schema has not been migrated or compared. The owner reports a verified Production backup/restore; retain its evidence for the migration review. Do not use Production as a substitute for staging.

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
- Verify the staging schema, backup, and restore process before applying any hosted migrations; production migration still requires explicit approval.
- Wait for Midtrans business review and complete sandbox/webhook tests before enabling checkout.
- Complete AdSense site verification and policy approval before enabling ads.
- Publish the privacy contact and verified email-erasure process before inviting students or processing real school data.

---

Never send passwords, API keys, or other secrets in chat. Configure them directly in the provider dashboards or as deployment secrets.
