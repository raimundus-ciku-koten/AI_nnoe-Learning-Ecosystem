Deployment and Release Guide — AI_nnoe Learning Ecosystem

Overview

This document lists the safe, zero-cost-friendly steps to review, stage, and publish the web release and Android build for AI_nnoe Learning Ecosystem. It assumes the feature branch `feature/demo-trial` contains the changes (trial UI, migration, tests, docs). Do NOT apply database migrations to hosted Supabase until backups and a staging verification are complete.

1) Pull request and review

- A branch `feature/demo-trial` has already been pushed. The GitHub PR form was opened for this branch.
- Recommended: submit the PR on GitHub, mark it as non-draft, and request reviews from the team (at least one reviewer familiar with Supabase RLS and queries).
- The PR must explicitly note this migration is source-only and must NOT be applied to hosted without approval.

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
  1. Create a disposable staging project (or clone production schema into a staging DB).
  2. Apply the migration SQL files (in `supabase/migrations/`) in order using the SQL Editor or `psql`.
  3. Run the full test suite (local and any DB-focused integration tests) against staging.
  4. After sign-off, apply migrations to production during a maintenance window.

The migration in this PR: `supabase/migrations/20261019000200_public_demo_trial.sql` creates `trial_registrations` and writes `trial_expires_at`. It is append-only but modifies `public.provision_auth_profile()` and `public.custom_access_token_hook()` logic. Audit these functions carefully in staging.

4) Environment variables (Vercel / Hosting)

Set these environment variables in Vercel (Project Settings → Environment Variables) for the Preview and Production environments. Use values from your Supabase console and external services, stored as project-level secrets (NOT in repo):

- VITE_SUPABASE_URL — Supabase HTTP URL (anon client uses only public-safe keys)
- VITE_SUPABASE_ANON_KEY — Supabase anon/publishable key (frontend)
- SUPABASE_SERVICE_ROLE_KEY — (ONLY for server-side functions; never expose to client)
- VITE_TURNSTILE_SITE_KEY — Cloudflare Turnstile site key (frontend)
- TURNSTILE_SECRET_KEY — Cloudflare Turnstile secret (server validation via Edge/Function)
- VERCEL_TOKEN — (only if automating deployments via CLI in scripts)
- MIDTRANS_SERVER_KEY / MIDTRANS_CLIENT_KEY — use Midtrans sandbox keys for testing
- ADSENSE_PUBLISHER_ID, ADMOB_APP_ID — placeholders until accounts are approved

Important:
- The frontend must never receive service_role or other server secrets.
- Implement serverless functions (Edge Functions) as a proxy for Midtrans using server-side secrets.

5) Midtrans integration (billing)

- Keep checkout disabled until you verify Midtrans sandbox behavior and the payment flow uses server-side verification.
- Implement an Edge Function / Supabase Function to call Midtrans server-side finalize endpoints using `MIDTRANS_SERVER_KEY`. The DB function `finalize_midtrans_payment()` is provided in migrations but must be executed only by `service_role` or via authenticated serverless functions.
- Test end-to-end with Midtrans sandbox credentials.

6) AdSense / AdMob

- AdSense requires account approval and site verification. Do not enable live ad units until AdSense approves the site.
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

I cannot build a signed Play Store APK/AAB without the signing key and the assetlinks.json being hosted. If you provide these securely (or create a CI secret in GitHub for them), I can add a workflow to build the signed bundle.

8) Post-deploy checks

- After deploying preview or production, verify:
  - Login flow works; Turnstile is enforced if enabled and Supabase verifies tokens server-side.
  - Superadmin allowlist entries work and the supplied emails can set passwords via the password setup flow.
  - Demo accounts can sign up and are limited to `/trial` and in-browser simulation only.
  - Billing pages show indicative pricing but checkout remains disabled until Midtrans is configured.

9) Rollout & privacy

- The selected policy is to keep the email record while the service operates, to prevent another trial with the same address. The final privacy process must provide a way to submit a verified erasure request; deleting the record permits that address to register for another trial. Publish registration only after the controller identity, privacy contact, and request process are in place.
- Add final legal contact and privacy-controller details to `/privacy` before inviting students or processing sensitive data.

10) If you want me to continue now (autopilot):
- I can prepare a Vercel deployment checklist and a GitHub Actions workflow to run build & tests on PRs.
- I can add a Play Store build workflow template that accepts signing secrets (you still must add the secrets in GitHub Actions secrets).
- I cannot apply Supabase migrations to hosted production without explicit credentials, backups, and a staging approval.

---

If you want a specific next action now, tell me which credentials/secrets you will provide (and how), or confirm if I should add the CI workflow templates and deployment docs to the PR. I will proceed accordingly and document each step in the PR comments.
