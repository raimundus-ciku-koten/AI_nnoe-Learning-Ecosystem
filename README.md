# AI_nnoe Learning Ecosystem

Monorepo for the AI_nnoe Learning Ecosystem web application and its backend
services.

## Release readiness snapshot (2026-10-22)

**Production login access was restored** by merging PR #7
(`832d04d`) to `main` on 2026-10-22. The outage observed on 2026-10-21 was
caused by the Production branch missing the web application source. An
anonymous check on 2026-10-22 confirmed that
`https://ainnoe-le.vercel.app/#/login` renders the login-only application and
the domain returns HTTP 200. This restores the login surface only; it does not
mean every data-backed module is ready for release.

The login page has email/password and Google sign-in controls; public signup
and trial registration remain disabled. There is no checkout or advertising
integration in this workspace. No hosted database migration was applied, no
credentials were entered, and no signup was submitted. The Staging schema,
verified backup/restore, and server-side CAPTCHA blockers below still apply.

The read-only Production check on 2026-10-20 confirmed the owner's active
Superadmin profile and matching JWT role claim. After the owner completed TOTP
verification, the local application displayed the Super Admin dashboard and
main navigation. This does not mean the updated MFA gate is deployed: PR #4
merged to the Preview branch only, and Production still uses the older gate.
The separate migration/restore and release blockers below still apply.

The three accounts in the separately supplied account document are present in
Production Auth, confirmed, and not banned. A successful login was not tested
with their credentials: one account has a prior sign-in, while two have no
recorded sign-in. The account owner must verify those sign-ins after deployment.
The supplied document contains plaintext password fields; keep it out of the
repository and rotate those passwords through the account provider.

This is a limited login release, not a full public release of signup or trials.
Payment processing and advertising integrations were removed from the local
workspace. The hosted Supabase schema and services were not changed by that
local cleanup; verify and remove any hosted resources separately before
claiming a complete service retirement.

## Product description and feature status

AI_nnoe is a role-controlled school workspace whose source includes teacher
data and planning tools, implementation and attendance screens, BK and
kokurikuler/extracurricular program drafts, assessment and question-bank
screens, communication, and optional Google Workspace integrations. This is a
description of modules in the application, not a statement that every module
is active in the hosted project. Several legacy planning links are explicitly
marked as such in the menu; some menu destinations are not built. Program
drafts stay in page memory until printed or saved as PDF. Chat, assessments,
and other data modules require their Supabase schema to be deployed and
verified; the hosted inventory currently shows those feature relations are
missing. Google features require OAuth setup and user consent. External AI
providers, checkout, and payment are disabled. The package catalog is
informational and does not guarantee package entitlements or feature
availability. Public metadata and landing-page copy should preserve these
limitations.

### Arsitektur layanan dan batas integrasi

- **Aplikasi web:** React/Vite di `web/`; browser hanya memakai URL Supabase
  dan publishable/anon key. Jangan pernah mengirim `service_role`, kunci
  provider AI, atau rahasia OAuth melalui variabel `VITE_*`.
- **Supabase:** Auth, PostgreSQL, Row Level Security (RLS), dan Edge Functions
  adalah batas identitas, data, dan operasi server. Skema lokal belum berarti
  skema hosted sudah siap; verifikasi migrasi, RLS, backup, dan pemulihan
  sebelum rilis data-backed.
- **Git dan GitHub:** Git menyimpan perubahan lokal; branch dan Pull Request
  menyediakan tinjauan serta riwayat. GitHub Actions menjalankan pemeriksaan
  CI. Perubahan lokal tidak otomatis menjadi perubahan `main`.
- **Vercel:** membangun aplikasi dari direktori `web/` dan dapat membuat
  Preview/Production melalui integrasi Git. Promosi Production harus mengikuti
  pemeriksaan CI dan persetujuan rilis; build sukses saja bukan verifikasi
  backend atau data.
- **Google Cloud Console:** mengelola OAuth client dan API Google yang
  digunakan untuk Workspace/Picker. Batasi origin dan API key sesuai kebutuhan;
  rahasia client OAuth tetap di server.
- **Cloudflare:** Turnstile adalah perlindungan anti-bot, bukan autentikasi atau
  otorisasi data. Pendaftaran tetap nonaktif sampai CAPTCHA benar-benar
  dikonfigurasi dan diverifikasi server-side oleh Supabase Auth.
- **AI dan Canva:** saat ini tidak ada satu produk AI yang menyamai seluruh
  aplikasi Gemini, DeepSeek, Claude, Grok, atau Canva. Integrasi model
  memerlukan API dan kebijakan masing-masing provider; biaya, kuota, fitur, dan
  hak pemrosesan data berbeda. Provider AI eksternal nonaktif di konfigurasi
  saat ini. Canva account/OAuth bukan editor desain; pembuatan dan penyuntingan
  desain belum tersedia. Jangan menjanjikan kemampuan ini sebelum adapter
  server-side, izin, pengujian, batas biaya, dan fitur produk benar-benar
  diimplementasikan.

### Indicative Indonesia price catalog

The school tiers have been adjusted to rounded Indonesian Rupiah price points:
Basic (100 students/20 teachers) Rp299,000 monthly or Rp2,990,000 yearly;
Pro (500/100) Rp699,000 monthly or Rp6,990,000 yearly; Enterprise (1,500
students) Rp1,499,000 monthly or Rp14,990,000 yearly. The existing student
and teacher monthly equivalents remain Rp14,900–Rp49,900, with their yearly
prices set to ten monthly equivalents (two months' equivalent discount).
Prices are indicative, before tax, and are not a claim of independently
verified market benchmarks or a final offer. Checkout is disabled. Confirm
scope, costs, applicable taxes, and entitlements before publishing an offer.
The append-only SQL price adjustment is
`supabase/migrations/20261019000100_indonesia_price_catalog.sql`; it has not
been applied to hosted Supabase. Do not apply it until the existing schema is
reconciled and the recovery prerequisite above is met.

## Backend migration status

The staged Supabase foundation is applied to project `jvcrmzmuxgyuetkjqady`
(`ap-south-1`). The Supabase browser client is available at
`web/src/lib/supabase.ts`, and `web/vercel.json` configures SPA routing and
security headers. GitHub Actions runs the web build and tests. On 2026-10-18,
Vercel reported a completed preview deployment for commit `61f54395` on
`migration/supabase-foundation-preview`. The preview host redirects to Vercel
authentication in the current browser context, so application runtime and any
production deployment remain unverified.

The chat source now supports direct messaging between users in one active
institution without a contact request, cross-institution discovery with
messaging and audio/video calls gated by an accepted contact request, and
superadmin-initiated chats/calls to active users. The new
`supabase/migrations/20261020000100_chat_access_and_calls.sql` migration adds
the required RLS policies and Realtime call-signaling table; it has not been
applied to hosted Supabase. Do not deploy it until the existing hosted schema
is reconciled and the required backup/staging checks are complete.

Audio/video calls require HTTPS (localhost is also supported) and browser
microphone/camera permission. Calls use private Supabase Realtime signaling
and short-lived TURN credentials from the authenticated `chat-turn-credentials`
Edge Function; configure `TURN_URLS` and `TURN_SHARED_SECRET` only as server
secrets. Never put TURN provider credentials in a `VITE_*` variable. Direct
calls are one-to-one; group calls use a full-mesh topology and are limited to
four total participants. Both are feature-gated and remain disabled until their
Staging migrations, private-channel configuration, TURN service, and browser
tests are verified. See `DEPLOYMENT_GUIDE.md` for the release gate.

The communication source now presents five tabs: Chat, Grup, Telepon, Video
Call, and Kontak. Telepon reads member-scoped call history for the last 90 days
and supports redial; direct incoming calls are recorded as missed or rejected,
and group calls with no accepted participants finalize as rejected when all
invitees decline. Video Call provides a shortcut into an existing conversation.
The call initiator alone writes the shared call record; other participants see
it through member-scoped history. The source-only migration includes a
service-role cleanup function for records older than 90 days, but no retention
schedule has been configured and the migration has not been applied to hosted
Supabase.
Text messages are still plaintext: E2EE, device pairing/recovery, and an
encrypted offline outbox are not implemented, so this is not an E2EE release.
The source now refuses to enable chat from `VITE_CHAT_ENABLED` alone; an
internal E2EE-readiness gate remains false until the protocol and migration
are implemented and verified. Keep chat/call feature flags disabled until all
release gates pass.

Migrations `20261016000100` through `20261016000300` and `supabase/seed.sql`
were applied through the Dashboard SQL Editor. On 2026-10-17,
`20261016000400_verified_superadmin_bootstrap.sql` was also applied to the
hosted project through the SQL Editor. The owner allowlist/profile and the
`public.custom_access_token_hook` were verified in Supabase Auth. The bootstrap
migration provisions allowlisted identities only after email confirmation.
Roles and tenant fields are not writable by browser clients. Do not document
real account identifiers or profile data in this public repository.

On 2026-10-17, migration
`20261017000100_platform_user_management.sql` was also applied to the hosted
project. It adds teacher profile fields and an audited
`public.manage_platform_user` function restricted to active superadmins.
Account-specific emails, identity numbers, names, and tenant assignments are
intentionally omitted from this public documentation.

The hosted project has no `supabase_migrations.schema_migrations` table, so
Dashboard-applied migrations are not registered in CLI migration history. The
historical notes above are not sufficient evidence to register those versions:
the latest read-only inventory found feature objects missing from the hosted
schema. Do not run `supabase migration repair`, `supabase db push`, or
`supabase db reset` against the hosted project until every existing object has
been reconciled against its migration and a recoverable deployment plan has
been reviewed. Record each migration only after its exact SQL has been applied
and its hosted effects verified.

On 2026-10-18, a read-only Dashboard inspection confirmed that the hosted
project still has no `supabase_migrations.schema_migrations` relation and the
Database → Migrations page says “Run your first migration.” A read-only
inventory found these six `public` tables: `platform_audit`,
`platform_control`, `platform_public_config`, `profiles`, `tenants`, and
`user_allowlist`. A further read-only inventory found 10 public routines, 7
public RLS policies, 2 public update triggers, and the 2 Auth provisioning
triggers on `auth.users`. These object counts and names are a snapshot, not
proof that routine definitions, policy expressions, trigger functions, grants,
or constraints match local migrations. An additional read-only catalog probe
on 2026-10-18 counted 30 public constraints, 104 table ACL entries, 2 explicit
column ACL entries, 29 routine ACL entries, 8 schema ACL entries, and 96
default-privilege ACL entries. These ACL counts are inventory only, not an
authorization review or proof of parity with local migrations. The inspected
feature tables for students, attendance, chat, Drive attachment registration,
web push, and payments are absent. Therefore, previous Dashboard-applied
migration notes must not be treated as proof that the complete current schema
is present.
Do not run `supabase db push` or mark additional migration versions applied
until each live table, function, policy, hook, and dependent data set has been
compared against its source migration and a recoverable deployment sequence is
approved. This inventory did not read profile, tenant, or other application
records. A separate read-only check on 2026-10-18 found only the six listed
identity/platform relations in `public`. A direct follow-up check confirmed
that all 24 feature relations defined by local migrations are absent:
`school_access_index`, `user_encryption_keys`, `drive_file_index`,
`drive_file_access`, `drive_file_key_envelopes`, `security_audit`,
`tenant_entitlements`, `students`, `attendance_records`, `testimonials`,
`school_announcements`, `chat_conversations`, `chat_messages`,
`chat_read_receipts`, `chat_inbox`, `chat_contacts`, `chat_presence`,
`billing_plans`, `personal_entitlements`,
`testimonial_submissions`, `question_bank`, `web_push_subscriptions`, and
`chat_push_dispatches`. The same check found that migration history is still
absent.
The Supabase Database → Backups dashboard was also inspected read-only on
2026-10-18 and states that the Free Plan does not include project backups.
Scheduled hosted backups therefore cannot be used as the recovery copy for this
cutover without upgrading, which is not allowed. The later Staging-only
encrypted artifact completed a disposable restore round-trip in run
40667639757, but its one-day retention does not provide an independent durable
Production recovery copy. Do not mutate Production schema or data until the
owner provides a no-cost Production recovery path and its restore has been
validated.
The local migration set also contains data-changing statements: the verified
owner bootstrap upserts a privileged allowlist/profile, and platform user
management provisions a tenant and updates allowlist/profile records for named
accounts. The billing migration seeds the initial package catalog but
preserves existing package rows on replay. Reconcile the owner and
named-account effects against current hosted identity and tenant data before
applying or replaying those migrations; do not infer safety from
`create table if not exists` or an idempotent object definition.
The read-only catalog query in `supabase/audit_hosted_schema.sql` provides a
repeatable inventory of public relations (including foreign tables and
materialized views) and columns (including user-defined type identity),
indexes, constraints, enum/domain/range types, RLS state, routine definitions,
policies, trigger definitions and enabled states,
schema/table/column/sequence/routine grants (including `PUBLIC` and default
privileges), migration-history table presence, and explicit presence flags for
all 29 feature tables/views declared by local migrations. It does not inspect
application rows or replace review of auth settings, Edge Function
deployments/secrets, or imported data.
The owner bootstrap migration was applied to hosted on 2026-10-17 and its seed
statements use conflict updates. Do not replay or register it as safe based on
the hosted owner state alone; first reconcile the current allowlist/profile
rows, Auth triggers, and function definition against the hosted catalog and
confirm a recoverable deployment plan.

The Edge Functions page was rechecked on 2026-10-18 and showed “Deploy your
first edge function”; `chat-push` was not deployed to this project. Do not rely
on chat push until its reviewed source, secrets, provider configuration, and
end-to-end behavior have been deployed and verified.

The owner bootstrap is complete for project `jvcrmzmuxgyuetkjqady`. The Auth
identity is confirmed and the matching profile/allowlist have been verified
active as `superadmin`. The bootstrap SQL updates existing matching owner
allowlist/profile values if replayed; do not replay it without first reconciling
hosted state and approving a recovery plan. Check the current result in the
SQL Editor with:

```sql
select id, email, role, tenant_id, active
from public.profiles
where id = '<verified-owner-user-id>';
```

Expect one confirmed, active `superadmin` row with a null `tenant_id`. The
owner must sign in again to Supabase Auth to receive a fresh access token with
the updated claims. Do not create or share a password on the owner's behalf.

Superadmins can open **Manajemen Pengguna Global → Pengguna Supabase** at
`#/platform/supabase-users`, sign in via an emailed one-time link, and manage
school admins, operators, teachers, students, and parent accounts. The page
uses the protected `manage_platform_user` RPC; role and tenant changes are
validated in the database and written to the audit table. New identities are
allowlisted without sending invitations; the interface cannot grant the
superadmin role or change an existing superadmin. Role/activity changes
apply on a new access token after sign-in or token refresh.

Before using the page, configure the exact site URL and the local/production
callback URLs in Supabase **Authentication → URL Configuration**. Keep
`VITE_SUPABASE_URL` and the anon/publishable key in the Vercel project
environment; the service-role key is not used or exposed by the browser. Email
link delivery remains subject to the project's Auth email limits.

New identities added from this page are allowlisted but are not emailed an
invitation. The primary application authentication layer now uses Supabase,
so allowlisted identities can participate in the app once their profile is
mapped and the session is refreshed. Existing confirmed Supabase identities can
have roles managed here. Confirm identity mapping, tenant assignment, and
staging sign-in for each account before sending any onboarding or recovery
email.

Supabase password recovery is the selected password-transition path for users
who need a new Supabase password. No bulk recovery emails have been sent.
Schedule onboarding only after identity mapping, data reconciliation, and
staging login tests pass.

The tenant profile mapping has an additive local schema migration at
`supabase/migrations/20261017000700_tenant_profile_fields.sql`. It maps
verified school metadata and the academic year/semester into nullable columns
on `public.tenants`, preserves existing `active` and target identity values,
and links `diperbaruiOleh` only through a unique `profiles.legacy_uid` match.
Semester values are stored as `ganjil`/`genap`. The checker does not export
records or write to Supabase. The source fields `alamat`, `kop`,
`logoSekolah`, and the backend-managed `langganan` object remain outside this
mapping until their schema and target behavior are separately verified.
The Data Dasar school-profile and academic-cycle screens now read and update
the mapped tenant fields through Supabase. Migration
`20261018000300_tenant_settings_updates.sql` adds admin-only update permissions
without allowing client changes to tenant status or identity. The new policy
and existing tenant-profile schema still need to be applied to the hosted
project; existing values remain subject to the report-only reconciliation
workflow.

The `platformAudit` mapping has a local additive schema migration
`20261017000400_platform_audit_legacy_context.sql`. The migration creates
deterministic candidate IDs from source document IDs, links actors through
`profiles.legacy_uid`, preserves source-only actor/role/tenant context in
`legacy_context`, and keeps `before_value`/`after_value` NULL when the source
does not establish those states. The SQL file has not been applied to the
hosted project, and the checker has not been run against exported data.

The approved new `public.students` core table is defined locally in
`20261017000500_students_core.sql`. It scopes each roster to its owner and
tenant, protects student fields with RLS, enforces the existing barcode/NISN
constraints, and requires an active tenant entitlement for writes. The Data
Siswa screen now reads and writes this table through Supabase; `urlScan` is
derived at runtime and is not persisted. Stable student codes are required at
creation/import; the barcode screen no longer exposes the retired post-hoc
code writer. This schema has not been applied to the hosted project,
and existing roster data still requires a verified reconciliation/import
before cutover.

The approved new `public.attendance_records` table is defined locally in
`20261017000600_attendance_records.sql`. It records immutable, owner-scoped
scan events with student snapshots, validates the student/tenant relationship,
and requires an active entitlement to insert. Barcode scanning and the
attendance history page use this Supabase table in the current frontend. The
legacy attendance path was confirmed empty, so there are no historical records
to import. The table migration has not been applied to Supabase hosted; scan
and history operations require that hosted schema and its dependencies first.

The active platform-controls context reads the `global` row from
`public.platform_control`. The platform operations UI updates it through the
protected `set_platform_control` RPC, and the maintenance guard hides
application pages from non-superadmins when maintenance is enabled. This is an
application-level gate only; it does not replace database RLS or prevent direct
API access. AI feature switches are also consumed by the assistant UI, but
must not be treated as backend enforcement. The standalone
`platformControlAdapter` test helper is not the active UI integration.

The planning teacher directory now reads active teacher profiles from Supabase.
Planning packages now use one end-to-end encrypted Google Drive file per
package. Package contents, generated documents, and modules are encrypted in
the browser; Supabase is used only for the public-key directory. Teachers own
and edit their packages. A same-tenant school admin can decrypt a package only
after its teacher explicitly grants access to that admin's key; the admin then selects the shared file in Google Picker to
grant the app per-file Drive access. Revocation
removes the key envelope before the Drive reader permission; copies already
opened or downloaded by an admin cannot be recalled. Older planning packages
have not been imported and remain a separate reconciliation task.
Migration `20261018000600_planning_drive_vault.sql` is local and has not been
applied to hosted Supabase; public-key registration and admin discovery need
that migration deployed first.
Planning-document generation through external AI providers is disabled in
no-billing mode. The encrypted package and local workflows remain available;
no curriculum context is sent to an AI provider.
For CP, a teacher explicitly selects a matching PDF with Google Picker. The
browser extracts and checks the selected subject and phase, then stores the CP
text and source metadata in the teacher's end-to-end encrypted Drive package;
the source PDF is not copied. Teachers can create or edit the ATP manually
from those canonical CP elements and the package's RPE, without an AI provider
or paid service. Review extracted CP text before relying on it, since PDF text
layout can affect extraction.
RPE records the scheduled JP for each selected weekday. A holiday now removes
only the JP assigned to that day, and Prosem uses each week's actual remaining
capacity. Existing planning packages without per-day values remain readable;
when edited, their weekly JP is distributed across the selected weekdays.
Unlike the connected Apps Script project, which uses a static/cache CP registry
and Gemini-backed generation, this web flow keeps the selected PDF as the CP
source of record and does not call an AI provider. In no-billing mode, teachers
can author and revise KKTP criteria per canonical ATP goal and Module Ajar
content per unit and meeting using structured manual editors. Both documents
are validated against the ATP and saved as end-to-end encrypted revisions;
optional module sections may remain empty. AI-assisted generation remains
unavailable, while existing saved documents remain readable and printable.

New Teacher Workspace notes now use the end-to-end encrypted Google Drive
vault. Supabase is queried only for entitlement metadata; note contents and
original filenames are encrypted in the browser before upload. The page
explicitly warns that older entries have not been imported and will
not appear in the Drive list. `scripts/reconcileTeacherWorkspace.mjs` remains
report-only and requires a verified encrypted Drive artifact per legacy entry;
it is not an importer or proof that old records were moved. The active page
uses the encrypted vault and warns that older entries have not been imported.
Keep any approved source export until an encrypted import is completed and reconciled.

Teacher schedules now use a per-user end-to-end encrypted Google Drive vault;
the active schedule page no longer reads the retired source and keeps warning
that older schedule entries have not been imported. Revision checks prevent ordinary
stale-update overwrites, but Google Drive does not make the metadata check and
upload atomic. `scripts/reconcileTeacherSchedule.mjs` is report-only; retain the
approved source export until an encrypted import has been completed and reconciled.

Teacher seating plans now use a per-user end-to-end encrypted Google Drive
vault as well. Class names, student IDs, seats, and group assignments stay
inside the encrypted payload; the page warns that older plans have not been
imported. The vault stores one revision containing all classes for that user,
so a stale revision is rejected rather than silently overwriting another
device's update. `scripts/reconcileTeacherSeating.mjs` remains report-only; keep
any approved source export until an encrypted import is completed and reconciled.

The legacy `scripts/reconcileQuestionBank.mjs` report-only checker describes
the superseded encrypted-Drive proposal and is not used by the active Bank Soal
runtime. The current table preserves the established tenant staff read and
teacher-owner write permissions with Supabase RLS. Existing legacy questions
remain a separate data-import task; do not use the legacy checker as proof
that those records have been moved.

Migration `20261017000200_superadmin_allowlist_read.sql` was applied to the
hosted project through the Dashboard SQL Editor on 2026-10-17. It grants
authenticated superadmins read-only RLS access to the allowlist so the page
can show pending identities. The migration is not registered in hosted CLI
history; reconcile its exact policy and grant effects with the live schema
before recording the version or using `supabase db push`.

`20261016000300_platform_controls.sql` defines Supabase tables and an RPC for
platform maintenance and AI feature switches. The current platform operations
UI calls the protected `set_platform_control` RPC. This does not make every
feature flag an enforced application or database gate; review each consumer
before relying on a switch to block access or backend work.

Supabase Auth is now the application login provider, and the active platform
administration, testimonials, attendance, and text-chat/contact/presence paths
use Supabase. The chat runtime requires migration
`20261018000200_chat_runtime.sql` in addition to the chat schema migrations.
Those recent feature migrations are local and have not been applied to the
hosted project. Encrypted chat attachments now use Google Drive ciphertext,
per-recipient key envelopes, and a Supabase registration RPC; each participant
must have an active vault key and Drive access. Migration
`20261018000800_chat_drive_attachment_registration.sql` is local-only, so the
hosted feature is not ready until migrations and Drive sharing are verified
there. A Supabase Edge Function now sends Web Push for new chat messages;
deployment and VAPID configuration still need verification.

The active Data Siswa list and write paths now use Supabase, but its schema is
local and existing roster data still requires reconciliation/import. The
dashboard reads recent chat previews from the RLS-protected Supabase
`chat_inbox` view. Schedule, pending-task, semester-progress, and
planning-history widgets do not present missing records as empty.
The teacher dashboard now reads today's schedule from the encrypted Google
Drive vault when the user's Google session and vault key are available; it
links to Workspace settings otherwise. Pending tasks, semester progress, and
planning history still await their target data sources.
Teacher assignments are read from Supabase `profiles.mapel_ids` and
`profiles.kelas_ids`. Older planning, workspace, schedule, and seating data
have not been imported; preserve approved exports until encrypted import and
reconciliation are complete. Legacy provider-specific source, deployment
configuration, rules, archived feature snapshots, and migration-only code
were removed from this workspace. This local cleanup does not delete hosted
projects, user data, deployed services, or provider accounts; those require a
separate owner-authorized retirement and recovery plan. The
Bank Soal runtime
now reads and writes the tenant-scoped Supabase `question_bank` table with RLS:
teachers and school admins can read within their tenant, while only an entitled
teacher can change their own questions. Its migration is local and existing
question records still need a controlled import. The retired service console
panel and navigation group have been removed from platform operations;
controls and access summaries use Supabase. The planning teacher directory and
school subscription status now read Supabase profiles/entitlements. External
AI assistant, question generation, and planning document generation remain
disabled. The local plan/entitlement schema requires hosted migration and
authorization verification; there is no local payment gateway.

### Materi digital, impor PDF, dan pendaftaran tenant

The local migrations `20261020000200_learning_materials.sql` and
`20261020000300_school_registration_approval.sql` add private tenant-scoped
PDF/DOCX materials and a superadmin-reviewed school registration flow. They
have **not** been applied to hosted Supabase. Do not deploy them until the
hosted schema has been reconciled against the existing migration baseline and a
recoverable deployment plan is approved.

Teachers can upload PDF or DOCX materials up to 20 MiB; authenticated members
of the same active tenant can read them page by page. PDF question import
extracts selectable text and recognizes numbered multiple-choice questions.
Teachers must review each extracted question and choose its answer key before
it can enter the question bank and be scheduled as a CBT exam. Scanned PDFs
need OCR and are not supported by this importer.

Exam drafts now persist in browser local storage and retry submission when the
connection returns. The server remains authoritative: an offline answer is not
counted as submitted until the server confirms it and accepts it within the
server deadline.

School requests remain unprovisioned until a superadmin manually confirms the
NPSN and enters the corresponding Ministry registry details. The workspace
does not currently have a configured official Ministry registry API, so this
flow fails closed to manual approval instead of claiming an unverified
automatic match. A confirmed request creates the tenant from the reviewed
registry values and provisions its requester as school administrator.

Run focused checks with `npm run test:learning` from `web/`.

### Read-only production usage snapshot (2026-10-17)

An earlier read-only dashboard snapshot inspected legacy service usage and
Supabase without exporting records or changing production settings. The
snapshot is historical, not a current usage report or an export estimate.

The Supabase project is on the Free Plan. Its usage page showed a 25.46 MB
database size against the included 0.5 GB/project limit, with 0 GB Storage,
0 GB egress, 0 monthly active users, and 0 Edge Function invocations for the
selected period. Quotas are organization-wide for billing and may include
other projects. These readings do not establish that a full import or normal
production traffic will remain free. In particular, Cloud Storage size and
object counts, identity mappings, Google Drive quotas, and export/import
traffic still need a read-only inventory and cost review.
The Dashboard Backups page was checked on 2026-10-18 and confirms that the
Free Plan does not include scheduled project backups. Before any hosted schema
or data mutation, arrange an external backup that has been verified restorable
or enable a suitable backup plan; do not treat the local migration files as a
recovery backup.

The selected target keeps identity, role, tenant, school/class/guardian access
indexes, Drive file IDs and ciphertext metadata, security audit entries, and
tenant entitlements in Supabase. Other application payloads are intended to
live as end-to-end encrypted files in each user's own Google Drive. File
owners may share a file only with school users whose access is verified by the
server; Drive permissions and encrypted per-recipient data-key envelopes must
be revoked together. Supabase must never receive plaintext document contents
or private encryption keys. External AI provider keys are not accepted or sent
in no-billing mode. Canva OAuth tokens remain unavailable until a trusted
server-side token exchange is implemented.

The operator selected an end-to-end encryption design. Recovery keys and
encrypted key backups are used by the vault; key rotation, account recovery,
and encrypted legacy-data imports still need explicit operational testing.
If a user loses the recovery key, encrypted documents may be unrecoverable;
password-reset email alone cannot restore encryption keys. Drive permissions
use a short-lived Google Identity Services token held in the browser; this app
does not retain Google refresh tokens. The local migration
`20261017000300_drive_owned_core.sql` creates the access indexes, Drive file
and encrypted-key-envelope metadata, audit, and entitlement tables with
RLS and no direct client write grants. It is a schema foundation only and has
not been applied to the hosted project.

Teacher Workspace notes, schedules, seating plans, and planning packages now
use AES-GCM encryption in the browser with RSA-OAEP recipient key envelopes.
Public-key directory entries are stored in Supabase, and package owners can
share and revoke read access for same-tenant school admins. Admins must select
shared planning files through Google Picker because the app uses the
least-privilege `drive.file` scope. The separate ordinary Drive upload remains
unencrypted and is explicitly labeled in the UI; use it only for non-sensitive
files.

The approved teacher-workspace note mapping has a local report-only checker
at `scripts/reconcileTeacherWorkspace.mjs`. It follows the owner-only rules
for `guruWorkspace` entries and accepts only metadata for an already
end-to-end encrypted Drive artifact. Note contents and titles are never
included in the proposed Supabase index or CLI report. The checker does not
read external services, upload files, or write to Supabase, and the current workspace
page is not wired to this migration flow.

The approved parent teacher-planning package mapping has a report-only checker
at `scripts/reconcilePlanningPackages.mjs`. It accepts only a complete,
validated package encrypted in Drive and requires owner decryption plus verified
Drive permissions and key envelopes for the source-authorized school admins
and active superadmins in the import manifest. Package contents remain
ciphertext-only outside Drive. The active runtime supports owner
create/edit/delete, encrypted document and module revisions, teacher-granted
key envelopes and Drive reader permissions, and admin selection through Google
Picker. The selected file IDs stay in memory for the current browser session;
the least-privilege `drive.file` scope does not expose shared files until the
admin opens them with Picker. Configure the restricted public API key before
using this flow. Keep any approved source export until every legacy package
has been imported and reconciled.

The approved planning-document mapping has a local report-only checker at
`scripts/reconcilePlanningDocuments.mjs`. It validates the parent package,
teacher directory and tenant, then requires owner write access and verified
read permissions/key envelopes for the matching school admins and active
superadmins. Admin/superadmin deletion remains deferred until a trusted server
workflow can revoke access and trash the Drive file; this checker does not
perform uploads or database writes.

The approved planning-module mapping has a local report-only checker at
`scripts/reconcilePlanningModules.mjs`. It additionally enforces that the
numeric module document path matches `noUnit` in the encrypted source record.
Owner write access and verified read permissions/key envelopes for same-tenant
admins and active superadmins are required; admin/superadmin deletion remains
deferred pending a trusted server revoke/trash workflow.

The approved teacher seating-plan mapping has a local report-only checker at
`scripts/reconcileTeacherSeating.mjs`. It keeps seating maps owner-only in
encrypted Drive files and requires a unique active teacher profile, active
tenant, a single owner key envelope and an explicit import timestamp. No student
names, class labels, source path or seat-map content appears in the proposal.

The approved teacher-owned student-roster mapping has a local report-only
checker at `scripts/reconcileStudents.mjs`. It targets the existing
`public.students` schema, requires an active owner role permitted by the source
rules (`admin_sekolah`, `operator`, `guru`, or `demo`), active tenant and unexpired
`trial`/`active` tenant entitlement, and uses the existing `buatKodeSiswa()`
helper to derive QR codes only when the source has none. Duplicate source
codes/NISNs and target collisions are quarantined; empty NISN/gender values
become SQL `NULL`. The checker does not export or write student records.

The approved scan-attendance mapping has a local report-only checker at
`scripts/reconcileAttendance.mjs`. It resolves each legacy student document to
the deterministic `public.students.id`, requires an exact owner/tenant/code/
name/class match, a valid active tenant entitlement and an unused student-day
key. Attendance snapshots remain immutable; invalid source records or target
conflicts are quarantined, and no data is written to Supabase.

The approved teacher schedule mapping has a local report-only checker at
`scripts/reconcileTeacherSchedule.mjs`. It uses the active `jadwalUtil` data
normalizer, quarantines the whole schedule if any session would be dropped,
preserves intentional time conflicts, and requires owner-only encryption and an
active target tenant entitlement. Schedule contents remain ciphertext-only;
invalid sessions and missing entitlements are not silently skipped.

The approved school-announcement mapping adds the local migration
`supabase/migrations/20261017000900_school_announcements.sql` and checker
`scripts/reconcileSchoolAnnouncements.mjs`. Supabase stores tenant-shared
announcement text as core school data, with active-tenant read RLS, staff-only
mutations, and entitlement-gated create/update; delete follows source staff
rules without an entitlement check. The checker is report-only and does not
apply the migration or write hosted rows.

The approved chat-conversation metadata mapping adds the local migration
`supabase/migrations/20261017001000_chat_conversations.sql` and checker
`scripts/reconcileChatConversations.mjs`. It maps only RTDB conversation
metadata, resolves participants through verified profile and `chatDirectory`
crosswalks, supports superadmin-created cross-tenant groups, and scopes reads
to active participants with RLS. The checker outputs only counts and quarantine
reasons in CLI mode and remains report-only. Inbox projections, read receipts,
presence, and attachment content are outside this parent metadata mapping.

The approved chat-message mapping adds the local migration
`supabase/migrations/20261017001100_chat_messages.sql` and report-only checker
`scripts/reconcileChatMessages.mjs`. Text content is stored in Supabase; media
messages contain only a Drive index reference. The checker quarantines media
messages unless the Drive file is active, owned by the sender, encrypted for
the current key version of every participant, and shared with active access
grants. Missing or ambiguous attachment crosswalks never create a successful
proposal. No attachment content is exported or uploaded by the checker.

The approved read-receipt mapping adds the local migration
`supabase/migrations/20261017001200_chat_read_receipts.sql` and checker
`scripts/reconcileChatReadReceipts.mjs`. Receipt rows use a composite
conversation/user key; active participants can read them, while each user can
write only their own cursor. The checker resolves users and conversations,
converts epoch milliseconds to UTC, and quarantines malformed, future, or
unmapped receipts.

The approved inbox mapping adds `public.chat_inbox` as an invoker-security view
in `supabase/migrations/20261017001300_chat_inbox_view.sql`. It derives each
user's latest message preview and unread count from normalized chat tables and
read receipts instead of copying denormalized `userChats` snapshots. The view
returns only the signed-in user's rows; clients must refresh it from underlying
conversation, message, and receipt subscriptions.

The approved authoritative-contact mapping adds
`supabase/migrations/20261017001400_chat_contacts.sql` and
`scripts/reconcileChatContacts.mjs`. Contact participants alone can read their
relation; same-tenant requests and recipient-only acceptance are enforced by
RLS. Direct conversation creation and new direct messages additionally require
an accepted contact. The checker verifies canonical legacy pair IDs, profile
and tenant crosswalks, and uses profile-name fallback only for missing snapshot
names. `userContacts` remains a derived projection, not a second source of truth.

The approved presence mapping adds
`supabase/migrations/20261017001500_chat_presence.sql` and
`scripts/reconcileChatPresence.mjs`. Supabase persists each user's
`last_seen_at` and current `online` heartbeat state; imported online flags are
not trusted. The active client refreshes its heartbeat every 30 seconds, and
observers treat a presence record as offline after 90 seconds without a
heartbeat, including an automatic UI update if a tab closes unexpectedly.
The checker converts source timestamps to UTC and omits stale online state.

The approved notification target is
`supabase/migrations/20261017001600_web_push_subscriptions.sql`, which stores
standard Web Push endpoints and encryption keys under owner-only RLS.
Devices must opt in to Web Push. Chrome/Chromium endpoints backed by FCM are
rejected; Mozilla, Apple, and Windows push endpoints remain supported. The
`chat-push` Supabase Edge Function validates the authenticated sender and
message, delivers a generic notification to other conversation participants,
and removes expired endpoints. The chat client invokes it after a successful
message insert; push failures are logged without misreporting the already-saved
message as failed. Deploy the function and set
`VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`, and `VAPID_SUBJECT` as Supabase secrets;
set the matching public key as `VITE_WEB_PUSH_PUBLIC_KEY` in each frontend
environment. Hosted delivery is not verified.
Dispatch claims are unique per message so retrying the endpoint cannot repeat
notifications; failed individual deliveries are logged but are not retried.

Workspace permissions now use Google's Identity Services token flow directly
instead of using Google as the primary login provider; the short-lived token is
managed by a separate Workspace service and scoped to the Supabase-authenticated
app user. Configure `VITE_GOOGLE_OAUTH_CLIENT_ID` with a public Web OAuth
client ID and register each exact local/production origin in the Google OAuth
client settings. Configure `VITE_GOOGLE_API_KEY` with a browser API key
restricted to the required web origins and Google Picker/Drive APIs. Neither
value is a client secret. The Google account email must match the signed-in
Supabase account.

### Cutover and zero-cost gate

Legacy data exports, storage/egress, Supabase usage, and deployment traffic may
incur charges or exceed free quotas. A zero-cost target is a constraint to
verify, not a guarantee of any provider's free tier.

No-upgrade operating constraint:

- Do not attach a billing account, upgrade Supabase or Vercel, or configure
  paid API credentials for this project. Large cloud exports are not part of
  the zero-billing path. The existing R2 backup workflow cannot produce backups without R2
  credentials, and the owner declined R2 because of potential charges. This
  branch replaces it with a manual, encrypted Staging artifact after merge;
  do not trigger a backup until Actions quota and billing are verified.
- Vercel Hobby eligibility and quotas must be checked against current terms.
  Do not use that plan for a monetized/commercial deployment unless its terms
  explicitly permit the use; do not upgrade to resolve a restriction.
- External AI APIs can incur charges or change their free quotas. Do not
  configure billable/shared AI keys under a no-billing constraint.
- Provider API keys are issued by their providers, not generated by this app.
  A provider's free quota or eligibility is not guaranteed. External AI remains
  disabled in the client; opening an official provider portal does not enable
  the integration or authorize sending prompts or keys.
- The purchase UI is informational only and does not create orders or request
  payments. Advertising is not included in the local application.
- Free-tier limits and provider terms can change. When a limit would require
  an upgrade, stop that feature rather than upgrading, enabling billing, or
  attempting to bypass the provider's limit.

### Free-tier recovery and operations

Production recovery remains an open release gate. The Supabase Free Plan has
no scheduled project backups, R2 was declined due to potential charges, and
there is no verified, independently stored Production backup. Do not treat
Staging evidence as Production recovery evidence.

#### Verified Staging-only pipeline

The manual-only `.github/workflows/supabase-backup.yml` is on `main` and
validates that its database URL targets the configured Staging project
`samszhfyhbjuculrcffg`; it rejects other projects and does not touch Production.
Run [40667639757](https://github.com/raimundus-ciku-koten/AI_nnoe-Learning-Ecosystem/actions/runs/40667639757)
completed an encrypted artifact round-trip on 2026-10-28: it restored the
Staging dump into disposable PostgreSQL 17, encrypted and decrypted it, restored
the decrypted dump into a second disposable database, and matched user-table
counts. The 352,895-byte ciphertext artifact was retained for one day.

This verifies a Staging database round-trip only. The workflow uses
`--no-owner --no-acl`, so it does not verify original ownership or grants; the
one-day artifact is not a durable recovery copy or a guarantee of zero cost.
Check current Actions storage usage and billing limits before any future run.
Never repoint the Staging workflow or its secret at Production.

| GitHub setting | Value |
| --- | --- |
| Secret `SUPABASE_DB_URL` | PostgreSQL direct or session-pooler URL for Staging project `samszhfyhbjuculrcffg`; never the transaction pooler URL. The workflow validates the target. |
| Secret `BACKUP_ENCRYPTION_KEY` | Base64 encoding of 32 cryptographically random bytes; store only in GitHub Actions secrets and never send its value through chat or commit it. |

Before a Staging run, configure both secrets directly in GitHub Actions
settings and verify current storage and billing limits. Download its encrypted
artifact within the one-day retention period, decrypt it on a trusted machine,
and restore it into a disposable PostgreSQL instance before a Staging
schema/data mutation.

#### Production recovery checklist (owner-run; not yet executed)

The owner selected an offline, owner-controlled encrypted copy. No Production
backup or restore was performed while preparing this checklist. Before
execution, verify the current Supabase limits and any compute/network egress
impact; stop if the operation could incur a charge or exceed the Free Tier.

1. Use a trusted, disk-encrypted workstation with PostgreSQL client tools
   compatible with the Production server's reported major version. Confirm the
   connection details identify Production project
   `jvcrmzmuxgyuetkjqady`. Keep the connection URI password-free and use the
   client's interactive password prompt; never put the password in shell
   history, command arguments, logs, or chat.
2. Create a custom-format logical database dump in a restricted temporary
   directory outside the repository. Follow current Supabase export guidance
   and preserve ownership and ACL information, or separately document how
   those will be restored. Do not copy the Staging workflow's
   `--no-owner --no-acl` options for a full-fidelity recovery plan.
3. Check the dump with `pg_restore --list`. Encrypt it with
   `scripts/encryptedBackup.mjs` using a base64 key for 32 cryptographically
   random bytes supplied through a secure local process environment. Store the
   key separately in an owner-controlled password manager, never beside the
   backup or in source control.
4. Copy only the ciphertext to the offline recovery location. Decrypt a
   verification copy into a protected temporary directory and restore it into
   an isolated disposable PostgreSQL/Supabase environment of the compatible
   major version. Use `pg_restore --exit-on-error`; never restore this test
   into Production. Any restore error, missing object, or unexplained grant or
   policy difference fails the drill.
5. Verify representative schema, extensions, functions, grants, RLS policies,
   and application records without printing or sharing row contents. Separately
   verify recovery for Supabase Auth configuration, Storage objects, Edge
   Functions/secrets, and project settings; a PostgreSQL dump alone does not
   demonstrate recovery of the complete Supabase project.
6. Record non-sensitive evidence only: timestamp, source project reference,
   client/server versions, ciphertext size, restore target/version, validation
   results, and responsible owner. Never attach a dump, connection URI, key,
   or personal data to an issue or pull request. Clean up plaintext temporary
   files after the drill; rely on disk encryption because deleting a file does
   not guarantee secure erasure on modern storage.

This checklist is not authorization to run a Production export and does not
clear the release gate. The owner must confirm the operation's cost and data
handling, define acceptable recovery-point and recovery-time objectives, and
complete and document the restore drill. A PostgreSQL restore alone is not a
full-project recovery test.

Start a local Supabase development stack with Docker and Supabase CLI from the
repository root using `npx supabase start`; inspect its connection values with
`npx supabase status`. Keep local migrations as SQL and never point local
commands at the hosted project. `npx supabase db reset` is destructive to the
local stack's data; run it only when that local data is disposable. Do not use
`supabase db push`, `migration repair`, or hosted reset on the current project:
its migration history and schema parity remain unreconciled, and a database
restore has not yet been proven.

### Privileged login, quota mode, and privacy

Admin-school and superadmin sessions now require TOTP MFA in the UI, and the
new migration `supabase/migrations/20261018001000_privileged_mfa.sql` also
requires AAL2 inside the shared database authorization predicate. The
migration is source-only until the hosted schema has been reconciled and a
recovery-tested deployment is approved. Enrolment needs a working Supabase Auth
MFA configuration; confirm TOTP support on the current plan and test with
non-owner administrator accounts before rollout.

Multi-role identity is implemented as a **source migration**, not yet applied
to hosted Supabase. Migration
`supabase/migrations/20261018001200_multi_role_identity.sql` stores trusted
assignments on the allowlist and profile, validates the selected role against
those assignments in the Auth access-token hook, and exposes the available
roles to the authenticated UI. Users switch roles from the profile menu after
sign-in; a role change updates user metadata only as a preference, then
refreshes the token so the server hook—not the browser—decides the active role.
The superadmin user-management page falls back to single-role mode until the
new columns exist.

Guru BK, Guru Kokurikuler, and Guru Ekstrakurikuler assignments require the
base Guru role and use the existing teacher authorization scope; they do not
create counselor case-note storage. Kepala Sekolah and Wali Kelas are not
school-admin roles. Their app navigation is dashboard-only, and the migration's
active-user authorization helper fails closed for active-only data policies
until dedicated server-side read/class-scoped permissions are designed. A
principal must be explicitly assigned Admin Sekolah to receive
tenant-administration access. This migration has not been reconciled or applied
to hosted Supabase. Review and test it on a recovery-tested staging schema,
including all role combinations and RLS boundaries, before enabling the
multi-role UI in a hosted environment.

Login supports Cloudflare Turnstile through `VITE_TURNSTILE_SITE_KEY`. It is
intentionally optional until the owner creates a Turnstile site key and
configures the matching secret/CAPTCHA provider in Supabase Auth. Setting only
the public site key will cause login challenges to fail; it does not enable
server-side verification by itself. Supabase Auth rate limits remain
independently enforced.

The login page now includes a three-day promotional demo signup. It requires a
verified email and Turnstile token, provisions only the isolated `demo` role,
and starts its 72-hour clock after email confirmation. The demo can only open
the sample-data page; persona choices are labels, not role grants. Its maximum
five added sample items remain in browser memory and are not sent to Supabase.
School data, tenant RPCs, uploads, Google, external AI, and payment are
unavailable to demo accounts. The append-only migration
`supabase/migrations/20261019000200_public_demo_trial.sql` stores a unique
verified-email trial record, expires access in the database, and removes demo
roles from active authorization. It is source-only and has **not** been
applied to hosted Supabase. Do not publish the signup until schema parity,
trigger/hook settings, server-side Supabase CAPTCHA verification, email
confirmation redirects, a Supabase Auth password minimum of 12 characters,
and recovery-tested backup have been verified. Per the selected trial policy,
the email record is retained while the service operates to prevent another
trial with the same address. A verified data-erasure request must be handled
under the final privacy process; deleting the record permits that address to
register for another trial. Publish the signup only after the service owner
has provided the required legal identity, privacy contact, and request process.

Reduced-data mode activates when a device advertises `Save-Data` or the release
sets `VITE_ECONOMY_MODE=true`. It hides external profile/school images and
reduces presence heartbeats to three-minute intervals. There is no verified
free-tier usage API wired into the app, so an automatic 80% quota trigger is
not implemented; the owner must check provider dashboards weekly and enable
the release flag when needed. The app has no summary-email digest feature to
defer.

The public `#/privacy` route is a transparent interim notice, not a legally
final policy. It calls out the current India South region, child-data
obligations, and unverified retention behavior. Before inviting students,
publish the controller's legal identity and privacy contact, document lawful
basis/parent consent and data-subject request handling, and obtain local legal
review under UU Pelindungan Data Pribadi (UU 27/2022). The requested Singapore
region, hosted retention jobs, an automated independent backup copy, and a
restore test still require owner action and validation. No hosted migration or account
configuration was changed as part of this repository work.

After an encrypted backup and a reviewed collection-to-table mapping exist,
migrate one feature at a time. For each feature, import and reconcile record
counts and representative records, test RLS with owner/tenant/non-member
identities, and run staging acceptance tests before routing production traffic.
Legacy provider CLI, SDK, deployment, or cloud export commands are not part of
this repository workflow. Data reconciliation and safe hosted retirement
remain separate tasks; no hosted data export or production cutover has been
run from this workspace.

For local setup, copy `web/.env.example` to `web/.env.local`, then set
`VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY`. For Vercel, set the same
variables in the project's Development, Preview, and Production environments.
The frontend key must be the Supabase anon/publishable key; never expose a
`service_role` key in the browser or a `VITE_*` variable. Configure database
access with RLS before wiring application data to Supabase.

### GitHub and Vercel

Push the repository to GitHub and import it into Vercel. For same-origin BFF
authentication and integration APIs, set the Vercel project Root Directory to
the repository root; the root `vercel.json` installs/builds the `web/`
application and deploys the repository-root `api/` functions. Setting Root
Directory to `web` omits those API functions and is not supported for the BFF
release unless the functions are moved into that directory.
Add `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` to all three Vercel
environments. GitHub Actions runs CI for pull requests and pushes to `main`;
Vercel's Git integration handles preview and production deployments when the
project owner has connected it. The preview commit `61f54395` on
`migration/supabase-foundation-preview` received a successful Vercel
deployment check on 2026-10-18
([deployment details](https://vercel.com/kotenraimundusc-4094/ainnoe-le/F84aZLJp8DaLRTpcpYzXzKiHnent)).
The [preview application](https://ainnoe-le-git-migration-supabase-fo-7b9dab-kotenraimundusc-4094.vercel.app)
redirected to Vercel authentication during runtime verification. Production
deployment, app runtime authentication, and plan eligibility have not been
verified. Do not upgrade or enable billing to overcome a free-plan limit.

### Hosted data and legacy exports

The local source cleanup does not delete hosted projects, deployed services,
provider accounts, user data, or old exports. No hosted deletion, database
migration, or export was performed. Before retiring a hosted service or
removing data, the owner must approve a recoverable export and verify the
target schema and access controls. Old installable Android APK/AAB outputs
remain preserved with a `.disabled` suffix; do not restore their package
extensions or distribute them.

### Referensi kalender pendidikan 2026/2027

The perencanaan form links to the uploaded provincial NTT guideline, Flores
Timur calendar decree, and SMA Swasta Katolik Frateran Podor school calendar.
The PDFs are served as static files from
`web/public/referensi/kalender-pendidikan-2026-2027/`. They are reference
documents only: dates are not imported into a plan automatically and must be
verified with the relevant school. The Frateran Podor calendar applies only to
that school and must not be treated as the default for other schools.

## Workspace map

| Path | Responsibility |
| --- | --- |
| `web/` | Vite frontend workspace: application source, static assets, tests, and generated `dist/`. |
| `web/src/pages/` | Route-level screens, grouped by product area. |
| `web/src/components/` | Shared React and DOM components. |
| `web/src/context/`, `web/src/hooks/` | Authentication context and reusable React hooks. |
| `web/src/services/` | Active Supabase, Google Workspace, and browser-side application services. |
| `web/src/views/` | Reusable chat views; feature-specific business logic stays in pages/services. |
| `web/src/utils/`, `web/src/lib/`, `web/src/types/` | Shared helpers, browser libraries, and data contracts. |
| `web/src/styles/` | Shared and feature-specific stylesheets. |
| `web/tests/` | Active frontend unit and integration tests. |
| `web/src/styles/legacy/` | Preserved unused stylesheets, excluded from runtime imports. |
| `scripts/` | Local, report-only data reconciliation utilities; not part of the deployed application. |
| `shared/pricing.json` | Informational plan catalog shared by the frontend and SQL seed tests. |
| `android-apk/` | TWA source; APK builds require an owner-provided public `TWA_HOST` and matching Digital Asset Links configuration. |
| `public/` | Root-level static assets retained for project tooling. The Vite app serves assets from `web/public/`. |

### Program BK dan kegiatan

The teacher-only `#/program-kegiatan` workspace provides a printable draft for
Bimbingan dan Konseling, kokurikuler, and ekstrakurikuler programs. The BK
template follows the uploaded guide's phases A-F, four service areas, service
components, needs assessment, goals, indicators, session steps, evaluation,
and follow-up. Kokurikuler planning also follows the guide's five project
stages, allows one to four graduate-profile dimensions, and includes fields
for evidence, cross-curricular links, partners and permissions, consent and
documentation ethics, copyright attribution, accessibility, offline
alternatives, safety and risk ownership, budget, separate formative and
summative assessment plans with a four-level rubric, showcase, and
sustainability. Phase A-D suggestions are identified as adaptations; topic
suggestions are location-neutral, while project location is user-entered.
Suggested themes are optional;
teachers may enter a custom topic. Drafts stay in page memory and are not
saved to Supabase or Drive. Do not enter student identities, counseling notes,
or case details. Persistent storage and specialty-specific account roles are
not implemented.

## Common commands

Run from the workspace root:

```powershell
npm run dev
npm run build
npm test
```

Frontend-specific tests and builds can also be run with
`npm --prefix web run test` or `npm --prefix web run build`.

## Purchase plans and Google Workspace

The plan catalog used to display prices is `shared/pricing.json`.
Its values are seeded into the server-only `public.billing_plans` table by
`supabase/migrations/20261018000400_plan_entitlements.sql`; keep the two
catalogs in sync when changing plans. Monthly prices are one tenth of annual
prices.

The purchase page displays package information and the user's entitlement
status only. It does not create orders or request payments; there is no payment
gateway integration in the local application.
The page also offers a limited manual registration/quote request. Applicants
can print the form to PDF locally and open a generic WhatsApp message; the
applicant must attach the saved PDF manually. Form values are not uploaded by
the application. The public WhatsApp contact is intentionally unconfigured
until the owner sets `VITE_OWNER_WHATSAPP` in the target Vercel environment;
every `VITE_*` value is visible in the public web bundle. The PDF is a request
for follow-up, not an order, invoice, payment receipt, or service activation.
The form deliberately omits identity-document uploads, passwords, payment-card
details, and children's NIK/KK data.
Entitlement reads are separate and remain subject to the hosted schema
availability noted above.

## Monetization

The local application has no payment gateway or advertising integration.
Plan prices are informational only; the app does not create orders or collect
payments. Hosted provider accounts and services are outside the scope of local
source cleanup and must be reviewed separately by the owner.

Google Workspace is available only to provisioned application users. Each user
can link their own same-email Google account from **Pengaturan → Google
Workspace**. The Drive connection asks only for basic identity and the
non-sensitive `drive.file` scope. Google Meet requests the non-sensitive
`meetings.space.created` scope only when a user explicitly creates a meeting;
the short-lived token stays in page memory. Calendar events are prepared as
Google Calendar template links and do not require Calendar API access. The app
does not request Gmail permissions.

Enable the Google Drive, Google Sheets, and Google Meet REST APIs used by the
features you enable, configure the OAuth consent screen and authorized web
origins, and set `VITE_GOOGLE_OAUTH_CLIENT_ID`. Google Picker also needs a
public API key in `VITE_GOOGLE_API_KEY`, restricted to the allowed web origins
and Picker/Drive APIs. External Google Cloud settings and any required OAuth
review are owner-managed; deploying this repository alone does not enable
access. OAuth verification status and Workspace administrator policy can still
affect real accounts, so test with representative `belajar.id` accounts before
rolling out.

The optional Google Sheets export asks for basic identity and the `drive.file`
OAuth scope separately. Google recommends this non-sensitive, per-file scope
for Sheets API access; the export creates a new sheet from user-pasted TSV data,
uses `RAW` cell input to prevent formula execution, and keeps the access token
only in page memory. Each Google OAuth grant requests only the scopes needed
for that action; previously granted scopes are not automatically accumulated.
No Google account or API key is bundled with the app.
The app does not automatically sync user records, use Sheets as an unattended
database backup, or promise that personal Drive/Sheets quotas are unlimited.

Chat conversations, contacts, text messages, read receipts, and presence use
Supabase tables with participant/owner RLS. New chat attachments are encrypted
in the browser and stored as ciphertext in Google Drive; a restricted Supabase
RPC atomically registers the Drive index, participant access, key envelopes,
and message. Recipients need an active vault key and Google Drive permission.
The attachment migration `20261018000800_chat_drive_attachment_registration.sql`
is local-only pending hosted deployment and verification. Existing legacy chat
files are not migrated automatically.
Web Push subscriptions are stored in Supabase and chat delivery is handled by
the `chat-push` Supabase Edge Function. Delivery requires deploying that
function and configuring matching VAPID keys in Supabase and the frontend.

Student rosters and attendance records use `public.students` and
`public.attendance_records`, protected by owner, tenant, and entitlement checks.
Schedule and seating screens still have legacy data paths and remain part of
the migration work. Teacher assignments are provisioned by a trusted admin
process in the Supabase profile `mapel_ids` and `kelas_ids` arrays and are
read-only in the client. The Data Dasar assignment screen now reads those
profile fields rather than the legacy assignment document; subjects
and classes are presented as separate lists because the target schema does not
store an explicit subject-to-class pairing. Existing assignments still require
verified provisioning before cutover.

Planning packages and documents are stored as encrypted files in Google Drive.
Teachers own and edit their packages; school administrators can read a package
only after its owner explicitly shares both Drive access and a key envelope.
Supabase stores public encryption keys and access metadata, not package
plaintext or private keys. Older planning records still require controlled
import and reconciliation; database RLS is the authorization boundary for the
active Drive vault.

Teacher schedules and seating plans also use encrypted Google Drive vault
files. The schedule page and teacher dashboard do not read old source records;
importing/reconciling those records remains pending.

The **Cari Orang** directory and chat contacts use provisioned Supabase
profiles under tenant RLS. New identities are managed through the protected
`manage_platform_user` RPC; pending identities remain allowlisted until they
confirm their Supabase Auth email. Obsolete seed and role-change utilities
have been removed.

The active question bank is available at **Asesmen dan Penilaian → Bank Soal**.
Questions are stored in the RLS-protected Supabase `question_bank` table;
teachers and school administrators can read questions in their tenant, only the
owning teacher can create, edit, or delete them, and students cannot read the
table because it contains answer keys. AI-generated question drafts and Canva
question-link creation are not available in no-billing mode.

The profile-menu **AI & Layanan** action opens **Pengaturan → AI & Layanan**.
External Gemini, DeepSeek, and Groq integrations are disabled in no-billing
mode: the app does not accept provider keys or send prompts to those services.
The assistant, AI question drafts, and AI planning generation are unavailable;
local planning and RPE workflows remain available. Server-side AI and Canva
OAuth endpoints are not available in the active application. Word chat
attachments are stored and downloaded in their original format; conversion
requires a separate paid/server-side service and is not available in Spark mode.
Planning documents track upstream revisions: a Modul Ajar now requires current
ATP, Prota, and Prosem inputs, and renders its CP/TP wording from the canonical
ATP plus time allocation from Prota and week placement from Prosem rather than
relying on generated paraphrases. Structured AI output validation rejects
unknown or missing fields, oversized values, unlinked CP elements, and
out-of-order semester plans instead of silently truncating them.

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
use Supabase queries protected by RLS; they do not create tenants, change
subscriptions, provision accounts, or modify role claims. The platform
operations pages expose the configured package catalog and role/menu matrix.
Global statistics are an on-demand Supabase snapshot of tenant, profile,
school-admin, and active allowlist counts, not billing, health, active-user,
or historical telemetry. Superadmins can switch platform controls through the
protected Supabase `set_platform_control` RPC. Actual changes write
server-timestamped audit entries to `platform_audit`; the browser cannot write
audit rows directly. Maintenance mode is an application-level gate and does not
replace RLS or restrict database access granted directly by database policies.
Subscription changes, role provisioning, global content management, billing
reports, and comprehensive service/usage telemetry remain unavailable until
their trusted APIs, data contracts, and audit handling are implemented.

## Local integration cleanup boundaries

The local workspace no longer contains Firebase deployment/runtime code,
payment gateway functions/orders, or advertising assets/components. The
informational plan catalog and entitlement schema remain because application
features use them for access checks. This cleanup only changes local source:
it does not delete hosted projects, deployed services, provider accounts, or
user data. Verify and retire any hosted resources separately before claiming
service retirement.

### Production release checks

The active frontend authenticates with Supabase and uses a separate Google
Identity Services OAuth grant for Google Workspace. Configure the Supabase
project URL and publishable/anon key, the approved Google OAuth client ID, and
the restricted Google Picker API key for the deployed origin. Never expose a
Supabase service-role key, Google client secret, or other server-side secrets
through `VITE_*` variables.

The Android TWA build requires `TWA_HOST` (or `-PtwaHost`) to name the deployed
public HTTPS hostname; a matching `/.well-known/assetlinks.json` must also be published for
the signing certificate before the APK can be trusted as a TWA. Until the
owner supplies that domain and verifies Digital Asset Links, do not build or
release the APK. `android-apk/twa-manifest.json` intentionally contains an
invalid placeholder and is not a deployable Bubblewrap manifest.

Before deploying, verify these project-level settings in Supabase and Google
Cloud Console; they cannot be enabled by this repository:

1. Supabase Auth is the current web login provider. Configure its Google OAuth
   provider and redirect URLs. Google Workspace access is granted separately
   through the direct OAuth flow and must be limited to the required scopes.
2. The active browser app uses Supabase Auth and data services. Local cleanup
   does not verify or remove hosted projects, data, or deployed services; that
   requires owner-authorized access and a migration/recovery plan.
3. Web Push subscriptions are stored in Supabase and the `chat-push` Edge
   Function is implemented locally. Its hosted deployment and VAPID
   configuration must be verified before relying on delivery.
4. The Android package is a Trusted Web Activity; native analytics and
   distribution services are not configured by this web build.
5. The AI assistant, question drafts, and planning-document generator are
   disabled in no-billing mode; no external AI provider is called. Review
   server-side integration and provider limits before enabling them.
7. Run `npm test` and `npm run build` for the active web application. Review
   Supabase migrations and target-project configuration before deployment;
   do not resolve a free-plan restriction by upgrading or enabling billing.

## Android APK

The Android package is a Trusted Web Activity for the hosted web app. The
The previous APK/AAB artifacts predate the public-host guard and may still
open an obsolete URL. Their contents are preserved locally with
a `.disabled` suffix so they are not treated as installable/releasable
packages. Do not rename them back, install, distribute, or release them. A
previously installed APK on a device is not changed by this workspace action.
The preserved artifacts are:

- `android-apk/AI_nnoe-Learning-Ecosystem.apk.disabled`
- `android-apk/app/build/outputs/apk/debug/app-debug.apk.disabled`
- `android-apk/app/build/outputs/apk/release/app-release.apk.disabled`
- `android-apk/app/build/outputs/bundle/release/app-release.aab.disabled`
- `android-apk/app/build/intermediates/intermediary_bundle/release/packageReleaseBundle/intermediary-bundle.aab.disabled`

The app needs an internet connection and Chrome (or a compatible browser) on
Android 7.0 or newer.

An APK build now requires the owner-selected HTTPS hostname and matching
Digital Asset Links file for the signing certificate. Set `TWA_HOST` only
after deploying the app to a public domain. Do not use the invalid
placeholder in `twa-manifest.json` as a release target.

To rebuild on Windows with Android Studio/SDK and Java 17 installed after
replacing the example below with the confirmed production hostname, run:

The Android build uses AGP 8.13.2 with Gradle 8.13 and compile SDK 36. Android
artifacts resolve through Google Maven and Maven Central; JCenter is retired.

```powershell
$env:TWA_HOST = "your-confirmed-domain.example"
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

## Online assessments

The online assessment implementation is in
`supabase/migrations/20261018001100_online_assessments.sql` and the web app
routes `/asesmen/ujian-online`, `/siswa/ujian`, and
`/admin/pengguna/tautkan-siswa`. Teachers can schedule questions they own from
the question bank; students need an active Supabase student account that the
school admin explicitly maps to a roster entry. Mapping changes are audited
and are blocked after a student has started an exam. Multiple-choice answers
are graded server-side; essay answers remain pending until their teacher
reviews them. Student scores are withheld until the scheduled exam window has
closed; teachers can view submitted results and pending essay reviews.
This migration does not create Auth users: provision student accounts only
through a trusted Supabase administrator or server-side process. Never put a
service-role key in the browser or enable public account creation to bypass
school approval.

Exam attempts use server-created deadlines, one attempt per roster student, and
idempotent answer submission. The client never receives correct answers.
During a network interruption, an already-open exam keeps its answers in
tab-scoped browser storage and retries submission when connectivity returns.
This is not a cold-start offline mode: the student must load the exam while
online, browser storage must remain available, and the server must receive the
submission before its deadline.

The assessment migration has **not** been applied to hosted Supabase. The
hosted schema and migration history remain unreconciled, and a restore-tested
backup is not verified; do not apply the migration or deploy these routes to
production until those operational gates have been completed. Static schema
checks and frontend tests do not replace applying the migration to a disposable
Supabase/PostgreSQL instance and testing role boundaries, RPCs, timers,
submission retries, and essay grading end to end.

## Maintenance conventions

- Keep generated output, dependencies, emulator logs, and local credentials out
  of application source folders.
- Put a new screen under its product area in `web/src/pages/`; reusable
  presentation belongs in `web/src/components/`; new auth/data integrations
  should follow the active Supabase or Google Workspace service patterns.
- Keep server-side provider secrets out of the browser and repository. Put
  reusable backend logic in the active, reviewed Supabase Edge Functions.
- Validate any data import in a disposable environment before a hosted
  migration.

## OAuth, sync, and AI connection source status

The connection settings screen and same-origin Vercel functions are local
source changes only. The migration
`supabase/migrations/20261103000100_integrations_sync.sql` has not been applied
to Staging or Production, Vercel server secrets have not been configured, and
no deployment was performed. The API reports an explicit configuration error
until those prerequisites are completed. Do not treat the feature as active.

- Google consent uses separate Authorization Code + PKCE flows for Drive
  (`drive.file`), Tasks (`tasks`), and the user's primary owned Calendar events
  (`calendar.events.owned`). Google refresh tokens are encrypted server-side
  with versioned AES-256-GCM keys. The service-only tables have RLS enabled and
  no browser grants.
- Sync runs on login/session restore, app foreground, reconnect, or manual
  request. Drive sync stores file metadata, not file contents; Tasks sync
  covers the default task list; Calendar sync covers the primary calendar.
  Sync state/cursors and normalized records are server-side. Offline mutations
  are queued in per-user IndexedDB and retried with bounded exponential delay.
  Conflicts preserve both snapshots and require a local/Google choice. A PWA
  cannot guarantee background work while closed.
- The generic mutation API currently handles metadata for Drive files and
  records for Tasks/Calendar; it is not yet mapped to all existing application
  planning, classroom, or calendar records. Verify provider quotas, large
  pagination, recurring events, time zones, and account revocation in Staging.
- AI adapters are split into local AI_nnoe/Ollama and an OpenAI-compatible
  server-side cloud adapter. The local adapter is the default for assistant,
  question, and planning workflows. Cloud is opt-in per assistant request,
  uses server-only secrets, blocks explicit sensitive prompts and common
  identifier patterns, and is capped at 10 requests per user per day by a
  server-side quota. It never silently falls back to cloud. The identifier
  check is a guardrail, not comprehensive DLP; do not send personal or student
  data to cloud. The cloud adapter is unavailable until configured.
- **Primary Supabase session:** password and Google sign-in, session restore,
  refresh, password recovery, and logout now use same-origin BFF routes. The
  Supabase SDK's custom storage is memory-only; its refresh token is held in an
  HttpOnly, SameSite cookie at the server boundary, and only the short-lived
  access token is made available to in-memory SDK/RLS queries. Configure
  `SUPABASE_PUBLISHABLE_KEY` server-side and add the exact callback URLs
  `/api/auth/google/callback` and `/api/auth/recovery/callback` to the Supabase
  Auth redirect allowlist. This source implementation is not deployed or
  validated against hosted Auth, OAuth configuration, or recovery email links.
  Staging validation is required before claiming production readiness.

Required Vercel server environment variables are documented in `.env.example`.
Never add them with a `VITE_` prefix. Generate and store encryption keys
directly in the deployment secret manager; retain old version keys during
rotation. Before rollout, apply and validate the migration only in a verified
disposable/Staging project, test OAuth consent/revocation and RLS isolation,
then separately approve deployment. No MCP or hosted database was touched for
this source change.
