Deployment and Release Guide — AI_nnoe Learning Ecosystem

Overview

This document records the release state and the remaining safe rollout steps for AI_nnoe Learning Ecosystem.

Current release status:
- Production is publicly available at `https://ainnoe-le.vercel.app/`. The Vercel production deployment is Ready; Preview remains protected.
- The production site and login page load anonymously. `/.well-known/assetlinks.json` returns HTTP 200 and its package name and signing fingerprint match the repository configuration and signed APK candidate. Supabase Production Auth initially reported `disable_signup=false`; on 2026-10-19, “Allow new users to sign up” was disabled in the `jvcrmzmuxgyuetkjqady` dashboard and the public settings endpoint now confirms `disable_signup=true` (`mailer_autoconfirm=false`). Existing users can still sign in. The endpoint does not expose a verifiable CAPTCHA status. The live login page still exposes the demo-trial entry point, but new account creation is currently blocked by Auth. No registration request was sent.
- The Vercel dashboard was inspected on 2026-10-19. Project `ainnoe-le` is connected to `raimundus-ciku-koten/AI_nnoe-Learning-Ecosystem`; the Production branch is `main`. `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` are split into Production-only values and Preview-only values for Staging (`samszhfyhbjuculrcffg`); the Preview publishable key is configured as a public `Config` value because it has the `VITE_` prefix. `VITE_TURNSTILE_SITE_KEY` remains Preview-only. No public-signup or `PRODUCTION_*_VERIFIED` variables are listed (unset means the reviewed source gates default off). Values were not revealed.
- The tested release candidate is committed and pushed to `feature/demo-trial-release` at `ed52e430`. Vercel built Preview deployment `ainnoe-c6s6n20vg-kotenraimundusc-4094.vercel.app` successfully; its bundle contains the Staging project ref and not the Production ref. The stable branch alias `ainnoe-le-git-feature-demo-trial-release-kotenraimundusc-4094.vercel.app` loads the login page, the signup/trial entry points are hidden, and the Turnstile widget generated a client token. This does not prove Supabase server-side CAPTCHA validation; no Auth request was sent. Production remains on its existing source revision.
- The workspace branch `feature/demo-trial-release` is not the Vercel Production branch `main`; it has not been merged into `main`. Do not use Vercel's current “Redeploy” on the old Production revision as a substitute for integrating and reviewing this source. The current public deployment remains the previous source revision.
- The source hides demo trial unless `VITE_PUBLIC_DEMO_TRIAL_ENABLED=true` and a Turnstile site key are configured. Keep the Production flag false until validation. The Vercel CLI project is not linked in this workspace.
- Trial registration must remain unavailable until Staging schema/runtime checks and server-side CAPTCHA validation pass. Do not test signup/trial flows in Preview before these checks and owner-approved synthetic identities are ready.
- The source hides demo trial unless `VITE_PUBLIC_DEMO_TRIAL_ENABLED=true` and a Turnstile site key are configured. Keep the Production flag false until validation. The Vercel CLI project is not linked in this workspace, and the current public deployment is not this local source revision.
- Trial registration must remain unavailable until a new Preview deployment from reviewed source is built, its bundle is verified to point to Supabase Staging, and Turnstile is verified server-side. The existing Preview deployment has not been rebuilt after the environment change; do not use its signup/trial flows.
- The Supabase organization is on the Free plan. Production `Ainnoe LE` (`jvcrmzmuxgyuetkjqady`) and `Ainnoe LE Staging` (`samszhfyhbjuculrcffg`) are both in `ap-south-1`. The reviewed identity/platform schema migrations and RLS guard have been applied to Staging only; Production has not been changed. Staging has the same public table, column, PostgreSQL constraint, index, policy, routine, and table-trigger counts as the read-only Production inventory, but exact definition/ACL parity and runtime security tests are still open.
- A Cloudflare Turnstile widget is configured for the exact Preview branch alias; its secret and CAPTCHA protection are configured in Supabase Staging only, and its public site key is configured for Vercel Preview. The widget generated a client-side token on the Preview alias. Server-side token validation and missing/invalid/expired/wrong-host cases have not been verified.
- **Active blocker:** the latest Preview bundle targets Supabase Staging and signup/trial entry points remain hidden, but Staging schema/runtime and server-side CAPTCHA tests are incomplete. Do not enable public signup. Production Auth blocks new signups, but Production server-side CAPTCHA enforcement remains unverified and must not be assumed.
- No hosted migrations have been applied to Production. Midtrans business review is in progress. AdSense has no registered sites yet; `ads.txt` is published, but ads are not active.
- School self-registration is implemented in source behind `VITE_PUBLIC_SCHOOL_SIGNUP_ENABLED`, off by default. It creates a pending registration request only; an active MFA-protected superadmin must approve before a tenant or `admin_sekolah` role is provisioned. Migration `20261019000400_public_school_registration.sql` has not been applied to Staging or Production. Do not enable the UI before the migration and server-side CAPTCHA flow have been validated on Staging.

Do NOT apply database migrations to hosted Supabase until backups and a staging verification are complete.

1) Pull request and release branch

- PR #3 (`Add secure 3-day demo trial and align Indonesian pricing`) is closed without being merged. The current candidate commit `ed52e430` is pushed to `feature/demo-trial-release`; `main` remains unchanged. No open pull request for this candidate was found.
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

The school-registration migration,
`supabase/migrations/20261019000400_public_school_registration.sql`, adds an
RLS-protected request table and narrowly granted submit/review RPCs. Test that
unverified users, already-provisioned accounts, duplicate NPSNs,
non-superadmins, and superadmins without AAL2 cannot submit or decide requests.
Verify approval creates tenant and school-admin access atomically and rejection
creates neither. Do not enable public signup before these runtime checks pass
on Staging.

Current blocker: Staging has the identity/platform baseline and RLS guard, but it is not a verified clone of Production and the full feature schema/security definitions have not been reconciled. No Production backup/restore has been verified. Do not use Production as a substitute for staging.

The staging database password was generated in Supabase during project creation and was not copied into this repository or chat. If direct database access is later needed for CLI migrations or backup/restore, reset it in Supabase and store the replacement in an approved password manager.

4) Environment variables (Vercel / Hosting)

Set environment variables in Vercel (Project Settings → Environment Variables) using values from the appropriate Supabase project and external services. Keep project-level values out of the repository. In particular, set `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` to the Staging project **for Preview only**, while preserving the existing Production values. Verify the built Preview bundle contains the Staging project ref before testing authentication:

- VITE_SUPABASE_URL — Supabase HTTP URL (anon client uses only public-safe keys)
- VITE_SUPABASE_ANON_KEY — Supabase anon/publishable key (frontend)
- SUPABASE_SERVICE_ROLE_KEY — (ONLY for server-side functions; never expose to client)
- VITE_TURNSTILE_SITE_KEY — Cloudflare Turnstile site key (frontend)
- VITE_PUBLIC_SCHOOL_SIGNUP_ENABLED — defaults to `false`; enable only after Staging schema and server-side CAPTCHA tests pass. Vercel Production rejects `true` until Production CAPTCHA validation is completed.
- STAGING_PUBLIC_SIGNUP_VERIFIED — non-public Vercel Preview build acknowledgment. Set to `true` only after the Staging migration, valid/invalid/expired CAPTCHA tests, and end-to-end public signup/review workflow have passed. The Preview build rejects either public signup flag without it; this acknowledgment does not itself configure or validate CAPTCHA.
- PRODUCTION_CAPTCHA_VERIFIED — non-public Production build acknowledgment. It permits a Production Turnstile site key only after server-side CAPTCHA setup and missing/invalid/expired/wrong-host/valid-token tests pass. It is not itself a security control or evidence.
- PRODUCTION_DEMO_TRIAL_VERIFIED — non-public Production build acknowledgment required to enable demo trial after the trial migration and end-to-end checks pass.
- PRODUCTION_SCHOOL_SIGNUP_VERIFIED — non-public Production build acknowledgment required to enable school signup after its migration, RLS, MFA review, and end-to-end checks pass.
- Turnstile secret: configure only in Supabase Auth CAPTCHA settings; never store it in Vercel or frontend environment variables.
- VERCEL_TOKEN — (only if automating deployments via CLI in scripts)
- MIDTRANS_SERVER_KEY / MIDTRANS_CLIENT_KEY — use Midtrans sandbox keys for testing
- ADSENSE_PUBLISHER_ID, ADMOB_APP_ID — placeholders until accounts are approved

Important:
- The frontend must never receive service_role or other server secrets.
- `VITE_PUBLIC_DEMO_TRIAL_ENABLED` defaults off. Keep it unset/false in Production until Production CAPTCHA and the complete trial flow have been validated. The Production build requires `PRODUCTION_CAPTCHA_VERIFIED=true` and `PRODUCTION_DEMO_TRIAL_VERIFIED=true` before enabling it.
- Keep `VITE_PUBLIC_SCHOOL_SIGNUP_ENABLED` unset/false until the public-school migration, verified-email check, RLS, superadmin MFA review, and CAPTCHA enforcement are tested on Staging.
- Do not set `STAGING_PUBLIC_SIGNUP_VERIFIED=true` until the evidence-backed Staging tests above pass; it is a build gate only, not a security control or proof by itself.
- Do not set any `PRODUCTION_*_VERIFIED=true` variable until the corresponding Production server configuration and test evidence is recorded. These are acknowledgments/build gates, not security controls or proof by themselves.
- The Vite build rejects Vercel Preview unless `VITE_SUPABASE_URL` targets Staging and rejects Vercel Production unless it targets Production. Correct the environment-specific URL before redeploying; do not weaken this check to make a deployment pass.
- Implement serverless functions (Edge Functions) as a proxy for Midtrans using server-side secrets.
- The current Staging Turnstile widget is restricted to the exact Vercel Preview hostname; its secret is configured in Staging Supabase Auth and only its public site key is in Vercel Preview. If the Preview hostname changes, update the widget and Supabase CAPTCHA configuration before deploying. Do not use a broad `*.vercel.app` hostname allowlist. Validate missing, malformed, expired, wrong-host, and valid tokens before any Production rollout.
- After staging validation and written approval, create a separate Turnstile widget restricted to `ainnoe-le.vercel.app`, configure its key pair in Production Supabase, and validate missing, invalid, expired, wrong-host, and valid tokens. Only then add the public site key to Vercel Production and set `PRODUCTION_CAPTCHA_VERIFIED=true`. Never store or expose the Turnstile secret in Vercel, source control, chat, or a frontend build.
- Keep Production signup flags false until the corresponding Production migrations and end-to-end tests pass. The Vite Production gate requires `PRODUCTION_DEMO_TRIAL_VERIFIED=true` for demo trial and `PRODUCTION_SCHOOL_SIGNUP_VERIFIED=true` for school registration, in addition to the CAPTCHA acknowledgment.

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
  - School signup is visible only in validated Staging; an email-only verified account receives no role or tenant until a superadmin completes an MFA-protected review, and applicant/RLS isolation is verified.
  - `https://ainnoe-le.vercel.app/.well-known/assetlinks.json` returns HTTP 200 with the APK package and signing fingerprint.
  - Superadmin allowlist entries work and the supplied emails can set passwords via the password setup flow.
  - After provider configuration is verified, demo accounts can sign up and are limited to `/trial` and in-browser simulation only.
  - Billing pages show indicative pricing but checkout remains disabled until Midtrans is configured.

9) Rollout & privacy

- The selected policy is to keep the email record while the service operates, to prevent another trial with the same address. The final privacy process must provide a way to submit a verified erasure request; deleting the record permits that address to register for another trial. Publish registration only after the controller identity, privacy contact, and request process are in place.
- Add final legal contact and privacy-controller details to `/privacy` before inviting students or processing sensitive data.

10) Remaining rollout steps
- Complete the source-to-catalog comparison for Staging and Production, including definitions, ACLs/grants, auth hooks, and RLS behavior; verify a restorable Production backup before any Production migration. The Staging baseline migrations are applied, but this is not yet proof of parity.
- Resolve the release PR/source-branch discrepancy: PR #2 is closed unmerged, so confirm the intended code branch and merge/deploy path before claiming the trial feature is part of a merged release.
- Configure Turnstile only after staging Auth is reachable, then validate server-side CAPTCHA enforcement and email redirects before enabling trial registration.
- Verify the staging schema, backup, and restore process before applying any hosted migrations; production migration still requires explicit approval.
- Wait for Midtrans business review and complete sandbox/webhook tests before enabling checkout.
- Complete AdSense site verification and policy approval before enabling ads.
- Publish the privacy contact and verified email-erasure process before inviting students or processing real school data.

## Final public-release gate status (2026-10-19)

This is a point-in-time status from the local repository and the provider pages available in the shared browser. It is not a production approval.

| Gate | Status | Evidence / required close condition |
| --- | --- | --- |
| Public web smoke check | Partial pass | The production root and `/.well-known/assetlinks.json` returned HTTP 200. A fresh anonymous visit displayed the login page. Authenticated login and protected feature workflows were not tested in this check. |
| Deployment/source identity | Candidate Preview verified; Production remains separate | Vercel Production remains on the existing `main` source revision (last inspected as `f414f1b`). Preview is Ready from `feature/demo-trial-release` at `ed52e430`; its bundle targets Staging. The candidate is pushed and CI passed, but it has not been merged into `main`, and no open PR for this candidate was found. Review branch history/diff against `main` and establish the intended integration path before any promotion. |
| Existing browser tab / lazy chunks | Needs follow-up | A previously open dashboard tab attempted to load an `AppShell` chunk from an older build. That URL returned the SPA HTML fallback rather than JavaScript, causing a dynamic-import error. The current production entrypoint and current `AppShell` chunk were both served successfully; a fresh anonymous visit loaded the login screen. Retest with a hard refresh and a new browser session after the release source is confirmed. |
| Local build and tests | Pass | The Vite production build completed; all 619 web tests passed, and the production dependency audit reported 0 vulnerabilities. GitHub Actions CI passed for `ed52e430`. The build emitted only the existing React Router `use client` bundler warning. |
| Turnstile | Runtime validation blocked | The prior “AI_nnoe Production Signup” widget was deleted. A staging-only widget is configured for the exact Preview hostname; its secret and CAPTCHA protection are configured in Staging Supabase Auth, and its public site key is Preview-only in Vercel. The widget generated a client-side token on the branch alias, but no Auth request or server-side validation case was tested. Verify missing, invalid, expired, wrong-host, and valid tokens before enabling signup or considering a separate Production widget. |
| Staging schema parity | In progress; not release-cleared | Applied to Staging only: `20261019000300_public_ddl_rls_guard.sql`, `20261016000100_identity_foundation.sql`, `20261016000200_auth_claim_hook.sql`, `20261016000300_platform_controls.sql`, the DDL/trigger-only portion of `20261016000400_verified_superadmin_bootstrap.sql`, the schema/function portion of `20261017000100_platform_user_management.sql`, and `20261017000200_superadmin_allowlist_read.sql`. The real owner, school, operator, and teacher seed statements were excluded. Read-only Staging inventory: 6 public tables, 40 columns, 30 `pg_constraint` rows, 7 indexes, 7 policies, 10 public routines, 2 public table triggers; all 6 tables have RLS enabled and none lack RLS. Staging contains 0 tenant, allowlist, or profile rows and the two generic platform configuration rows. Counts match the Production inventory, but exact definitions, grants/ACLs, auth-hook configuration, and the fail-closed error path are not yet fully compared/tested. |
| Production backup and restore | Blocked | No verified backup-and-restore evidence is available. Before any Production migration, create an encrypted logical backup using approved credentials and demonstrate restore to a disposable local/staging database. Do not put credentials or backup data in Git or chat. |
| Midtrans | Blocked / disabled | The available dashboard was the sandbox. No Production business approval or verified end-to-end Production payment evidence was established. Keep checkout/webhooks fail-closed. Transaction fees mean live payments cannot satisfy a strict zero-cost guarantee. |
| AdSense / AdMob | Blocked / disabled | AdSense remained in onboarding with no connected site in the inspected page. Keep ad scripts disabled until site and policy approval. The current Android TWA is not an AdMob-native app; do not advertise AdMob support as available. |
| Account data supplied separately | Restricted | The supplied account document contains personal account/profile identifiers (including email, institution, and teacher identifiers). It is outside the repository and must stay out of Git, public demos, test fixtures, and chat. Use synthetic identities for public/staging tests. If any plaintext password or provider secret is present in that document, rotate it through the owning provider. |

### Production catalog drift discovered

The read-only Production inventory found an additional `public.rls_auto_enable()` security-definer event-trigger function and an enabled event trigger named `ensure_rls`. The trigger runs at `ddl_command_end` for `CREATE TABLE`, `CREATE TABLE AS`, and `SELECT INTO`; the function enables RLS on newly created tables in `public`. Neither object existed in the repository migrations. Migration `20261019000300_public_ddl_rls_guard.sql` now captures this guard. Its reviewed version rethrows RLS-enable failures so table creation fails rather than continuing without RLS; the current Production function catches and logs those failures without aborting the DDL. The migration is now applied in Staging, where `ensure_rls` is enabled and all six public tables were verified to have RLS. The forced-failure behavior has not been tested. Production has not been changed. Include this intentional behavior difference in the exact source-to-catalog comparison and later Production change/approval plan. Do not remove the existing Production trigger during reconciliation.

The observed table and column inventory is consistent with the identity/platform foundation migrations through `20261017000200`, including the later teacher profile fields. However, exact definitions for constraints, function bodies, policies, ACLs, defaults, and event-trigger ownership still need a source-to-catalog comparison. The additional RLS event trigger is already a known discrepancy.

The migration `20261016000400_verified_superadmin_bootstrap.sql` includes a real owner identity seed, and `20261017000100_platform_user_management.sql` ends with real owner/school/operator/teacher seed statements. Neither seed block was applied to Staging. Staging currently has no tenant, allowlist, or profile rows; use a synthetic, owner-approved staging identity only if an authenticated workflow test requires one.

### Required order to reach a production go/no-go

1. **Freeze risky surfaces.** Keep public trial registration, hosted migrations, live checkout, and ads disabled. Do not put the supplied account document or any real student data into Preview or public demo flows.
2. **Choose and verify the release source.** Candidate `feature/demo-trial-release` at `ed52e430` is identified, pushed, CI-passing, and deployed to Vercel Preview. Review its complete history and diff against `main`, then establish the intended pull-request/integration path; do not merge or promote until the scope and base are explicitly reviewed. Check that `.env` files, service-account files, signing keys, and account records are not tracked.
3. **Inventory Production without writing.** Re-authenticate to Supabase and export/read the catalog definitions needed to compare tables, columns, constraints, indexes, functions, triggers, RLS policies, grants, hooks, event triggers, and storage configuration against every relevant migration. Reconcile the untracked `ensure_rls` guard into source before claiming parity. Record drift; do not run `migration repair`, `db push`, or SQL migrations during this inventory.
4. **Prepare a recoverable backup.** Use an approved, secret-safe method to produce an encrypted logical backup. Restore it into a disposable local or staging database and record the restore result. If the available Free plan does not provide a suitable managed backup, use an approved local `pg_dump` workflow; do not assume a dashboard snapshot exists.
5. **Finish staging verification.** Staging now has the identity/platform baseline and `ensure_rls` guard from the reviewed migrations. The real identity seed blocks in `20261016000400` and `20261017000100` were excluded; its identity tables contain no tenant, allowlist, or profile rows. Compare exact schema/security definitions and grants against Production, test the guard's fail-closed path and authenticated workflows with an owner-approved synthetic identity, then run database-focused, integration, and web tests. Do not treat matching object counts alone as schema parity.
6. **Close staging signup security.** A staging-only Turnstile widget and Preview-only Supabase URL/publishable key are configured, with Production values kept Production-only. The Ready Preview at `ed52e430` was confirmed to bundle the Staging project ref; login loads and signup/trial entry points are hidden. The widget generated a browser token on the branch alias, but no signup/Auth request was sent. Test missing, malformed, expired, wrong-host, and valid tokens, email confirmation/redirect, and abuse limits using owner-approved synthetic test identities. Keep Production registration closed until these tests pass.
7. **Validate optional commercial integrations separately.** Complete Midtrans sandbox creation, server-side status verification, signed webhook, amount/order checks, idempotency, and failure-path tests. Enable Production billing only after provider approval and explicit acceptance of transaction fees. For a strict zero-cost launch, leave billing disabled. Complete AdSense site/policy verification before enabling ads; ads are not a prerequisite for the core free release.
8. **Review privacy and release scope.** Confirm the published controller/contact and verified deletion-request process, data retention, incident contact, user terms, and that no student data is used in public testing. Keep the supplied account document private and use synthetic demo accounts.
9. **Obtain written owner approval.** The owner must approve the exact commit, migration IDs, backup/restore evidence, enabled features, provider costs, rollout window, and rollback owner. Approval to continue preparation is not approval to migrate Production or enable billing/ads.
10. **Deploy and smoke-test the approved scope.** Promote only the verified commit. Test the public login and OAuth flow, an authorized account, restricted routes, trial fail-closed behavior (or the approved Turnstile flow), critical feature reads/writes, assetlinks/package/signature match, and all referenced lazy-loaded chunks in both a fresh session and an already-open tab. Verify Vercel's Production deployment is Ready and tied to the approved commit.
11. **Monitor and stop on failure.** Keep a rollback path to the last known-good frontend deployment. Do not roll back or alter database state blindly; use the rehearsed recovery plan. Disable the affected optional feature and investigate if auth, schema, security, or asset loading checks fail.

**Go/no-go rule:** Until steps 2–9 have verifiable evidence and written owner approval, the system may remain available for the currently safe, limited login experience, but it is **not approved for unrestricted public/student use**. “Zero cost” is an operating target, not a guarantee: Free-tier quotas, provider policy changes, traffic, backups, and payment fees can introduce limits or costs. Keep paid or metered features off unless their cost and approval are explicitly accepted.

---

Never send passwords, API keys, or other secrets in chat. Configure them directly in the provider dashboards or as deployment secrets.
