# Project Guidelines

## Architecture

- This repository is a monorepo. The Vite single-page application is in `web/`; it uses Supabase through `web/src/lib/supabase.ts` and feature services in `web/src/services/`.
- Supabase schema changes are versioned in `supabase/migrations/`; server-side integrations and privileged operations belong in Supabase Edge Functions, not browser code. Authorization must be enforced by server-validated claims and database RLS, not by client-side identity checks.
- `android-apk/` contains the Android Trusted Web Activity. Firebase files and legacy application areas remain in the repository for compatibility; check the active implementation and its docs before extending or replacing them.
- The workspace also contains the `ale-web` Git submodule. Confirm which repository/worktree owns a requested change before editing.

## Web application

- Keep route-level UI in `web/src/pages/`, shared components in `web/src/components/`, and reusable data/integration logic in `web/src/services/`. Follow the neighboring module's existing test style: Node's test runner for `.test.js`/`.test.mjs` files that import `node:test`, and Vitest for tests already configured for Vitest.
- Supabase browser configuration uses only `VITE_SUPABASE_URL` and the public anon/publishable key. Never place a service-role key or provider secret in browser code or any `VITE_*` variable.
- A rendered page or a successful anonymous smoke test proves only that UI surface. Do not infer working authentication, RLS, Edge Functions, OAuth, CAPTCHA enforcement, or stored data without testing those paths in the intended environment.

## Supabase and integrations

- Treat `supabase/migrations/` as append-only history. Read the full migration and its data effects before proposing changes; do not edit/replay an applied migration to fix hosted state. Prefer a reviewed follow-up migration that preserves existing data and contracts.
- Before any hosted migration, reconcile migration provenance and schema/RLS parity, restore a verified backup into a disposable database, and obtain the required owner approval. Do not use hosted Production as a test environment or run `supabase db reset`, `supabase db push`, or `supabase migration repair` against it without those gates.
- Keep privileged operations and provider calls in `supabase/functions/`. Read secrets with the server-side function environment, validate the caller and authorization on the server, and fail closed when required configuration is absent. Verify provider behavior in Staging; source code and configured dashboard values alone are not proof of a working integration.
- Firebase source, rules, and snapshots are retained for migration analysis and are not active deployment targets. Do not invoke Firebase deployment tooling, revive archived APK/AAB outputs, or delete legacy assets without an explicitly reviewed cutover plan.

## Android Trusted Web Activity

- `android-apk/` wraps the hosted web app; it is not a native Firebase or AdMob application. Set `TWA_HOST` to the intended public HTTPS hostname (no scheme, path, port, placeholder, or Firebase host) before building.
- Use the checked-in Gradle wrapper (`./gradlew` on Unix-like systems or `.\gradlew.bat` on Windows). Keep release signing material in the user-level Android properties file, never in the repository. The temporary signing key created by Android CI is only for build verification and must not be distributed.
- Before publishing an APK/AAB, verify the target host, package identity, signing fingerprint, Digital Asset Links, versioning, store metadata, and release approval. A successful CI assemble is not a Play Store release.

## Browser verification

- Use the built-in VS Code browser tools or the configured Playwright MCP for focused UI checks. Verify the expected page and interactions; do not use a rendered login screen as proof of backend readiness.
- Do not enter real user credentials, submit signup/payment flows, or alter hosted data during smoke tests unless the user explicitly authorizes that exact action. Keep browser checks on the intended Preview/Staging or Production environment and report which one was tested.

## Build and test

Run these from the repository root:

```sh
npm test
npm run build
```

The CI build runs from `web/` with `npm run build -- --mode ci`.

For focused checks, run an existing script from the root, for example:

```sh
npm --prefix web run test:role-access
npm --prefix web run test:assessment-ui
```

For a single test file without a dedicated script, run from `web/`:

```sh
node --test tests/privileged-access-migration.test.mjs
npx vitest run src/services/onlineAssessments.test.js
```

Use the Node version required by `web/package.json` (`>=20.19.0`). Supabase Edge Functions run in Deno; check the current workflow and function-specific tests before claiming a type-check or deployment was performed.

## Repository-specific workflow

- Before editing, committing, or pushing, inspect `git rev-parse --show-toplevel`, `git status --short --branch`, and (when relevant) `git submodule status`. Confirm the intended branch, worktree, and remote; do not assume a separate PR worktree is the active workspace.
- Check release documentation and the current PR/deployment state before changing release status. Do not put transient commit SHAs in living readiness snapshots; identify the branch/PR instead. If a status claim is tied to a commit, verify it against the latest SHA after the final commit.
- Keep Preview and Production environments separate. A passing build, CI check, or Vercel deployment does not prove backend readiness or public accessibility. Verify the relevant runtime behavior and report which environment and commit were checked.
- Do not apply or register hosted Supabase migrations until migration provenance and schema/RLS parity are reconciled, a backup has been restored successfully to a disposable environment, and the required owner approval is recorded. Never treat a Preview configuration as Production configuration.
- Keep account-specific identifiers and credentials out of public docs, UI defaults, and chat. Put secrets directly in the approved secret manager or ignored local environment files, never in `VITE_*` variables unless the value is explicitly intended to be public. Do not rewrite historical migrations solely to redact old values; use a compatibility-safe remediation plan.
