# AI_nnoe Learning Ecosystem

Monorepo for the AI_nnoe Learning Ecosystem web application and its backend
services.

## Backend migration status

The Supabase and Vercel foundation is being introduced in stages for project
`jvcrmzmuxgyuetkjqady` (`ap-south-1`). The Supabase browser client is available
at `web/src/lib/supabase.ts`, and `web/vercel.json` configures SPA routing and
security headers. GitHub Actions runs the web build and tests; connect the
GitHub repository to Vercel to create preview and production deployments.

The first Supabase migration is `supabase/migrations/20261016000100_identity_foundation.sql`.
Apply both SQL files in `supabase/migrations/` in order, then run
`supabase/seed.sql`. The seed grants the supplied owner email
`kotenraimundusc@gmail.com` the initial superadmin allowlist entry. In the
Supabase Dashboard, configure `public.custom_access_token_hook` as the Custom
Access Token Hook under Authentication → Hooks. New identities start inactive
and unprovisioned unless a trusted administrator has added an active email to
`public.user_allowlist`; role and tenant fields are not writable by browser
clients. Provisioning and account/data import are still operator tasks and must
be completed before switching the app's login provider.

This is an infrastructure-only first stage: active application features still
use Firebase Auth, Firestore, Realtime Database, Storage, and Cloud Functions.
Do not disable or remove the Firebase project yet. Supabase schema, Row Level
Security policies, feature/data migration, and the production cutover must be
completed and verified before Firebase can be retired.

For local setup, copy `web/.env.example` to `web/.env.local`, then set
`VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY`. For Vercel, set the same
variables in the project's Development, Preview, and Production environments.
The frontend key must be the Supabase anon/publishable key; never expose a
`service_role` key in the browser or a `VITE_*` variable. Configure database
access with RLS before wiring application data to Supabase.

### GitHub and Vercel

Push the repository to GitHub and import it into Vercel. Set the Vercel project
Root Directory to `web`; `web/vercel.json` supplies the Vite build and output
settings. Add `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` to all three
Vercel environments. GitHub Actions runs CI for pull requests and pushes to
`main`; Vercel's Git integration handles preview and production deployments.

## Workspace map

| Path | Responsibility |
| --- | --- |
| `web/` | Vite frontend workspace: application source, static assets, tests, and generated `dist/`. |
| `web/src/pages/` | Route-level screens, grouped by product area. |
| `web/src/components/` | Shared React and DOM components. |
| `web/src/context/`, `web/src/hooks/` | Authentication context and reusable React hooks. |
| `web/src/services/` | Firebase-backed application services (authentication, chat, messaging, AI calls). |
| `web/src/firebase/core/` | Browser Firebase SDK initialization and Auth, Firestore, and Realtime Database connections. |
| `web/src/firebase/index.js` | Shared Firebase client entry point, including lazy Storage initialization. |
| `web/src/firebase/` | Feature-specific Firebase repositories. |
| `web/src/views/` | Reusable chat views; feature-specific business logic stays in pages/services. |
| `web/src/utils/`, `web/src/lib/`, `web/src/types/` | Shared helpers, browser libraries, and data contracts. |
| `web/src/styles/` | Shared and feature-specific stylesheets. |
| `web/tests/` | Frontend unit and rules test cases. |
| `web/src/styles/legacy/` | Preserved unused stylesheets, excluded from runtime imports. |
| `functions/` | Deployed Cloud Functions source, private server-side integrations, and function tests. |
| `scripts/` | Local administration and data-seeding utilities. |
| `tests-rules/` | Standalone Firestore Security Rules tests for the Emulator Suite. |
| `firestore.rules`, `firestore.indexes.json`, `storage.rules` | Firestore database `default` and Storage rules selected by the root `firebase.json`. |
| `database/`, `dataconnect/` | Realtime Database and Data Connect configuration or assets. |
| `reference/feature-packs/` | Preserved feature-package snapshots; not part of the frontend build or root Firebase deployment. |
| `reference/legacy-root-app/` | Unused root-level frontend snapshot, retained for reference and excluded from the app build. |
| `reference/legacy-firebase/` | Unused alternative Firebase bootstrap helpers; not imported by the active app. |
| `public/` | Root-level static assets retained for project tooling. The Vite app serves assets from `web/public/`. |

## Common commands

Run from the workspace root:

```powershell
npm run dev
npm run build
npm test
npm run emulator
```

Frontend-specific tests and builds can also be run with
`npm --prefix web run test` or `npm --prefix web run build`. Cloud Function
unit tests run with `npm --prefix functions test`.

## Purchase plans and Google Workspace

The purchase plan catalog lives in `functions/shared/pricing.json`, inside the
deployed Cloud Functions source so both the browser and server use the same
prices. It follows the official annual plan table; monthly prices are one tenth
of annual prices. Midtrans payment channels such as DANA and Google Pay are
available only when enabled for the merchant account and configured in Midtrans.

While checkout is being finalized, the purchase page supports a manual request
only: it copies the selected package, billing cycle, account details, and
displayed total so the user can contact an administrator for verified payment
instructions. No payment is initiated or confirmed in the app; an admin must
verify any transfer and activate the subscription manually. The app does not
display bank details or accept proof-of-payment uploads. Midtrans is not
connected to this manual flow.

The automatic checkout and webhook implementation in `functions/` is a
separate Blaze-only option. It is not deployed or enabled in the Spark setup.

## Google AdSense for web/PWA

The signed-in web shell supports one responsive AdSense display slot at the
bottom of the viewport. It stays disabled unless both
`VITE_ADSENSE_CLIENT_ID` (`ca-pub-...`) and `VITE_ADSENSE_SLOT_ID` are set in
the Vite production environment. Configure them only after creating an
AdSense publisher account, adding and verifying the site, and receiving
approval for ads. These IDs are public; never put account passwords, payment
details, or private API credentials in frontend environment variables. The
production build also publishes the AdSense site-verification meta tag and
`/ads.txt` seller record. Google must still review and approve the site and
ad unit in the publisher account; deploying these identifiers does not
guarantee that ads will immediately be served.

The Android project is a Trusted Web Activity (TWA) for this same web/PWA, not
a native AdMob app. AdSense configuration applies to its web content; a native
Android/iOS application would require a separate AdMob SDK integration and
app/ad-unit IDs. Creating or approving either Google publisher account,
setting up payments, and publishing the Android app require the owner's
Google/Play Console actions. Do not release a Play Store build until its
payment flow and Google Play billing-policy requirements have been reviewed.
See [functions/README.md](./functions/README.md) for checkout, webhook, and
merchant setup.

Google sign-in is restricted to already provisioned users with server-managed
role and tenant claims. Each user can link their own same-email Google account
from **Pengaturan → Google Workspace**. Before using Drive, Calendar, or Gmail,
enable those APIs in the Firebase-associated Google Cloud project and configure
the OAuth consent screen, authorized domains, and verification for
`drive.file`, `calendar.events.owned`, and `gmail.send`. External Google Cloud
settings and OAuth approval are required; deploying this repository alone does
not enable access.

New chat attachments are stored directly in Firebase Realtime Database under
`chatAttachments/{chatId}/{fileId}`. RTDB Rules permit reads only to current
chat members, and only the uploading member can create or remove their file.
The client and rules both cap each attachment at 2 MiB; base64 encoding uses
about one-third more space. Recipients can optionally choose **Simpan salinan
di Drive saya** to upload their own copy after same-email Google consent.
Profile photos remain in Firebase Storage, compressed to JPEG at no more than
128 KiB, and load directly through the Firebase client SDK. Drive access tokens
remain in memory only. New media uploads/read operations do not require Cloud
Functions. Existing legacy chat files stored in Cloud Storage are not migrated
automatically.

The Spark plan's Firebase quotas still apply; exceeding a free quota can make a
service unavailable until its quota resets. No Cloud Functions or billing
account are enabled by the new media flow.

School identity and active academic-year settings are stored on
`tenants/{tenantId}`. Teacher-owned student records, schedules, and seating plans
are stored under `guru/{uid}` and are protected by owner, tenant, and active
subscription checks. Teacher assignments are provisioned by a trusted admin
process and read-only in the client. Validate these policies with
`npm run test:rules`.

Planning-package metadata is provisioned and edited only by school admins or
superadmins from **Manajemen Perencanaan → Paket Guru**. Teachers can read their
assigned packages and continue generating/updating their own RPE–Modul documents.
Firestore Rules enforce the same boundary; hiding editor controls is not the
security boundary.

The **Cari Orang** directory uses a minimal, email-free profile for each
provisioned, active Authentication account. New accounts are added by
`scripts/seed.js` or `scripts/setRole.js`. To backfill existing accounts, run
`node scripts/syncDirectory.js` with Firebase Admin credentials and the correct
`FIREBASE_PROJECT_ID` and `FIREBASE_DATABASE_URL` (defaults to the project's
`-default-rtdb` instance). The script also fills the Realtime Database chat
index so superadmins can start conversations with provisioned users who have
not signed in yet. Teachers see users in their tenant; superadmins can
search across roles and tenants. Disabled or unprovisioned accounts are not
listed.

The active question bank is available at **Asesmen dan Penilaian → Bank Soal**.
Questions are stored under `tenants/{tenantId}/questionBank/{questionId}`;
only the owning teacher can create, edit, or delete them, and students cannot
read the collection because it contains answer keys. School administrators can
review the tenant's questions. Teachers can generate a one-question draft with a configured personal browser
provider, then review and save it. Canva-based question links require the
server-side Canva Connect integration and are not available without billing.

The profile-menu **AI & Layanan** action opens **Pengaturan → AI & Layanan**.
In no-billing mode, users provide their own Gemini, DeepSeek, or Groq API key;
the key is kept in browser memory for the current tab and requests go directly
to that provider. Provider preferences are stored locally per Firebase UID on
that browser and are not synchronized between devices. These are personal
provider credentials, not a shared platform connection. Cerebras blocks
browser-origin requests through CORS, while Canva OAuth requires a server-side
exchange; neither is available in no-billing mode. Provider free quotas and
terms can change. Server-side encrypted keys and Canva OAuth require deployed
Cloud Functions and Secret Manager. See [functions/README.md](./functions/README.md).
Claude is disabled until a verifiably free API endpoint exists. Word chat
attachments are stored and downloaded in their original format; conversion
requires a separate paid/server-side service and is not available in Spark mode.

Sidebar navigation is scoped by role: teachers/operators/demo accounts,
school administrators, superadmins, students, and parent-account aliases receive
their respective menu catalogs. Unknown or missing roles receive only the
dashboard link. Existing teacher features such as planning, attendance, the
question bank, chat, and Google Workspace keep their dedicated workflows.
Teacher submenu destinations without a dedicated data module open a private,
tenant-scoped work-notes space at
`tenants/{tenantId}/guruWorkspace/{uid}/entries/{entryId}`. Only that teacher
can read those notes; writing requires an active tenant subscription. They are
not official grades, attendance, reports, or student communications; do not
enter student-identifying or sensitive information. Other roles continue to
receive an informational page where their module workflow is not implemented.

Superadmins can read the platform tenant directory at
`/platform/tenant/sekolah` and the global school-admin directory at
`/platform/pengguna/admin-sekolah`. Both views are read-only, paginated, and
rely on the superadmin-only Firestore list rules; they do not create tenants,
change subscriptions, provision accounts, or modify role claims. The platform
operations pages also expose the configured package catalog, role/menu matrix,
client Firebase configuration, service-console links, and an on-demand
Firestore document-count snapshot at the global statistics and usage pages.
These are not billing, health, audit, active user, or historical telemetry.
The superadmin can also switch the AI assistant, AI document generation, and
user-facing maintenance mode through an App Check-protected Cloud Function.
Each actual state change writes a server-timestamped, client-immutable audit
entry. The current runtime state is exposed in `publicConfig/platform` with
read-only client rules; secrets and actor metadata stay in protected
`platform/controlState`. Maintenance mode blocks non-superadmin application
routes and AI/checkout callables, but it is not a substitute for disabling
directly authorized Firestore access or a security incident response.
Subscription changes, role provisioning, global content management, billing
reports, and comprehensive service/usage telemetry remain unavailable until
their trusted APIs, data contracts, and audit handling are implemented.

## Firebase configuration boundaries

The root `firebase.json` is the deployment entry point. It selects
`functions/`, Firestore rules/indexes, Storage rules, Realtime Database rules,
and `web/dist`. New chat attachments use member-protected RTDB records; profile
photos use Firebase Storage directly with authenticated SDK requests. No media
Cloud Function deployment is required. Legacy chat attachments in Storage
remain separate and are not copied into RTDB automatically.

```powershell
npm run deploy:rules
npm run deploy:host
```

Set the Firebase project in `.firebaserc` and provide local frontend settings
through `web/.env.local` based on `web/.env.example`. Never commit service
account credentials, local environment files, App Check debug tokens, or AI
provider keys.

### Production release checks

The committed `.firebaserc` target must be the same Firebase project as the
frontend configuration. Production builds validate the required Firebase SDK
settings, the App Check site key, an explicit `VITE_USE_EMULATORS=false`, and
that no App Check debug token is configured. The Firebase Web SDK config,
reCAPTCHA site key, and Web Push VAPID public key are public client settings;
service-account credentials, App Check debug tokens, and provider/payment
secrets must never be placed in `VITE_*` variables.

Before deploying, verify these project-level settings in Firebase/Google Cloud
Console; they cannot be enabled by this repository:

1. Enable the required Authentication providers and add the production Hosting
   domains to Authentication's authorized domains.
   The current web/TWA login uses Firebase JS SDK email/password and Google
   popup flows; it does not use passwordless email-link authentication or the
   Firebase Android Auth SDK. The Firebase Dynamic Links migration warning is
   therefore not applicable unless one of those flows is added.
2. Register the web app in App Check with the matching reCAPTCHA Enterprise
   site key and allowed production domains. Confirm valid tokens are received
   before enforcing App Check on Firestore, Realtime Database, and Storage.
   The deployed callable Cloud Functions already require App Check.
3. Enable Firestore, Realtime Database, Storage, and Cloud Messaging as used by
   the app. Generate a Web Push certificate key and set
   `VITE_FIREBASE_VAPID_KEY` in the production build environment to enable push.
   The `notifikasiPesanBaru` Realtime Database trigger must also be deployed;
   client devices store their FCM registration token in their own RTDB record,
   and notifications require authorized chat membership metadata.
4. Performance Monitoring is initialized by the web app after the first render
   when the browser supports it. Verify that the web app is registered and
   metrics arrive in the Performance dashboard. Remote Config parameters are
   not yet consumed by application features; define their defaults and connect
   them to a specific feature before publishing values.
5. Crashlytics and Release Monitoring are native Android/iOS features, not web
   JavaScript SDK features. This Android package is a Trusted Web Activity;
   register its Android application and add the native Firebase SDK only if
   native wrapper crash reports are needed. App Distribution is a release
   workflow: upload a signed APK/AAB and configure tester groups in Firebase
   Console. None of these Console projects can be provisioned by the web build.
6. Firebase AI Logic is not the current AI provider integration. The app uses
   its existing BYOK/provider flow; enable and integrate AI Logic deliberately
   only after deciding model access, App Check, quotas, and billing.
7. Do not enable Blaze unless the project owner explicitly approves billing.
   Cloud Functions-backed payment, platform administration, server-side AI, and
   push notifications remain unavailable while using Spark.
8. Run `npm test`, `npm --prefix functions test`, the Firestore/Storage rule
   tests against the Emulator Suite, and `npm run build`. Review database
   migrations and the target project before running deployment commands.

For a Firebase Spark project, `npm run deploy` (or `npm run deploy:spark`)
builds and deploys Hosting, Realtime Database rules, and Firestore rules/indexes
for the existing named database `default` without attempting to deploy Cloud
Functions. The browser SDK, Admin SDK, scripts, rules, and indexes must all use
that same database ID; `(default)` is a different database and is not provisioned
in this project. Cloud Functions, Functions-backed payment/admin/AI/media
endpoints, and push-notification triggers require Blaze. Firestore rules/indexes
are deployed and tested here. Storage rules require the Firebase Storage
service/bucket to be provisioned; do not assume a successful Hosting deploy
means Storage is ready. Check that service in the Firebase Console before
deploying its tested rules.

For a Blaze project with the required services and secrets configured, use
`npm run deploy:blaze`. Rule deployment is separate from Hosting and Functions;
test the selected rules and indexes in the Emulator Suite before applying them
to production.

## Android APK

The Android package is a Trusted Web Activity for the live Firebase Hosting
app. It needs an internet connection and Chrome (or a compatible browser) on
Android 7.0 or newer. The installable APK is
[`android-apk/AI_nnoe-Learning-Ecosystem.apk`](./android-apk/AI_nnoe-Learning-Ecosystem.apk).
It is debug-signed for direct testing/sideloading and is not a Play Store
release.

To rebuild on Windows with Android Studio/SDK and Java 17 installed, run:

```powershell
$env:ANDROID_HOME = "$env:LOCALAPPDATA\Android\Sdk"
$env:ANDROID_SDK_ROOT = $env:ANDROID_HOME
$env:JAVA_HOME = "C:\Program Files\Java\jdk-17"
Push-Location android-apk
.\gradlew.bat assembleDebug
Pop-Location
```

The generated file is `android-apk/app/build/outputs/apk/debug/app-debug.apk`.
The wrapper opens the hosted web app; web updates do not require rebuilding
the APK.

To create a Play Store upload bundle, configure the local upload keystore at
`%USERPROFILE%\.android\ainnoe-upload-signing.properties` (the file must define
`storeFile`, `storePassword`, `keyAlias`, and `keyPassword`), then run:

```powershell
Push-Location android-apk
.\gradlew.bat bundleRelease
Pop-Location
```

The signed bundle is `android-apk/app/build/outputs/bundle/release/app-release.aab`.
Keep the keystore and its local properties file backed up securely and never
commit or send them. The `assetlinks.json` entry currently trusts this upload
key for the directly installed release APK. A Play Console account,
store-listing/data-safety forms, and the Play app-signing certificate
fingerprint must still be added to `assetlinks.json` after Play App Signing is
configured; do not substitute the upload-key fingerprint for the Play signing
certificate.

## Maintenance conventions

- Keep generated output, dependencies, emulator logs, and local credentials out
  of application source folders.
- Put a new screen under its product area in `web/src/pages/`; reusable
  presentation belongs in `web/src/components/`, and Firebase operations
  belong in `web/src/services/` or `web/src/firebase/`.
- Initialize the browser Firebase app only through `web/src/firebase/core/`
  and import shared services from `web/src/firebase/index.js`.
- Keep Cloud Function provider secrets server-side and put reusable function
  logic in `functions/lib/`.
- Treat `reference/feature-packs/` as migration/reference material. Promote
  code into the active application explicitly rather than importing from an
  archived package.
