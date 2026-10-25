# AI_nnoe Learning Ecosystem

Monorepo for the AI_nnoe Learning Ecosystem web application and its backend
services.

## Local verification snapshot (2026-10-25)

The repository-level `npm test` suite and `npm run build` completed successfully.
The local anonymous login page returned HTTP 200 and had no browser console
errors or warnings. A mobile Lighthouse audit of that page scored 100 for
Accessibility, Best Practices, SEO, and Agentic Browsing after adding
`web/public/llms.txt`. This automated result covers only the anonymous login
page, not the full application or WCAG conformance. The built local preview
also had no horizontal overflow at 320 px; a 1x CPU/Fast 4G trace recorded
LCP 929 ms and CLS 0.00. These are local lab measurements, not field data or
performance guarantees.

Responsive 1x/2x PNG variants now serve the application logos instead of
downloading the full-resolution source art for small UI placements. The
high-resolution originals remain in place for social sharing metadata.

These checks cover the build, automated tests, and one public page only. They
do not verify authenticated menus, tenant data, hosted schema or migrations,
cross-tenant RLS, encrypted-backup decryption and restore, CBT load, full WCAG
conformance, Android/WebView behavior, or incident readiness. No hosted
database or production settings were changed. Do not interpret this snapshot
as confirmation that every feature is active or release-ready.

The read-only query in `supabase/audit_hosted_schema.sql` now checks presence
for every public table and view declared by the checked-in migrations and
reports the migration-history table's column metadata when present. Its
automated consistency check is `npm run test:schema-audit`. This inventory
does not read applied migration versions, establish migration provenance, or
prove hosted parity; review actual hosted definitions and migration records
separately before any change.

## Staging schema checkpoint (2026-10-25)

Workflow run #25
([40207632790](https://github.com/raimundus-ciku-koten/AI_nnoe-Learning-Ecosystem/actions/runs/40207632790))
completed the encrypted Staging backup round trip: the uploaded artifact was
downloaded, decrypted, compared with its source dump, and restored to a
disposable database. The read-only Staging audit passed its expected
58-relation and migration-history inventory gate. The workflow also replayed
all 59 migrations then checked in on a clean Supabase baseline and verified
all 58 expected feature relations. Neither check changed Staging. This proves
backup recovery for that Staging snapshot and repository migration replay for
that commit; it does not establish definition-level parity with Production or
authorize hosted DDL. The short-lived Actions artifact is not a durable
Production recovery copy.

The current worktree adds migrations
`20261026000100_learning_classroom_schedules.sql`,
`20261026000200_teacher_learning_workflows.sql`, and
`20261026000300_teacher_rubric_workflows.sql`, adding three expected feature
relations to the 58-relation baseline. These additions were not part of run
#25. Commit `cf6a54b` has since replayed the expanded 62-migration chain
against the pinned disposable Supabase database in Web CI; Web CI and Vercel
Preview both passed for that commit. The Preview is Vercel-protected, so an
anonymous browser acceptance check could not be completed. Production restore
evidence, exact Staging/Production definition comparison, migration-specific
approval, and authenticated release acceptance tests remain required before
hosted schema changes. Keep public signup and billing disabled.

PR #15 remains open against `main` and includes the validated feature-code
commit `cf6a54b`. Its Web CI, including the disposable migration replay, and
its Vercel Preview deployment passed. Future PR updates continue to validate
the actual migration chain and audited feature relations before they can be
considered release candidates.
The approved rollout scope is the active, data-backed features for the
superadmin, guru, and siswa roles; billing/payment and public signup/trial
remain excluded. Scope approval does not authorize hosted DDL before the
restored-schema preflight and approval of the exact migration versions.
The Staging audit now rejects an incomplete expected-relation inventory and
labels relation/history inventory readiness as blocked whenever relations or
hosted migration history do not match. The backup workflow preserves a
verified encrypted artifact, then fails the overall run if that inventory is
blocked; the inventory is not a definition-level schema comparison.
Historical rollout notes below may describe the earlier, unverified backup
state.

The web app also provides spoken Indonesian (`id-ID`) feedback for the initial
welcome, loading states, and in-app notifications. Browsers commonly block
autoplay, so speech begins after the user's first click, tap, or keyboard
interaction. The authenticated app provides a control to turn spoken
notifications off or on.

The mobile navigation drawer moves keyboard focus into the menu when opened,
keeps Tab and Shift+Tab navigation within the open drawer, returns focus to its
trigger when dismissed with Escape, and moves focus to the page content after
navigation. This interaction has focused unit tests; it does not replace
keyboard and screen-reader testing across the full application.

## Release readiness snapshot (2026-10-22)

**Production login access was restored** by merging PR #7
(`832d04d`) to `main` on 2026-10-22. The outage observed on 2026-10-21 was
caused by the Production branch missing the web application source. An
anonymous check on 2026-10-22 confirmed that
`https://ainnoe-le.vercel.app/#/login` renders the login-only application and
the domain returns HTTP 200. This restores the login surface only; it does not
mean every data-backed module is ready for release.

The login page has email/password and Google sign-in controls. Public account
signup and trial registration have been removed from the application UI; the
public login page and package page display catalog prices and a WhatsApp link
to the owner (`+6282236267895`). There is no order, checkout, or payment flow,
and advertising assets/integrations are removed from the active web app. No
hosted database migration was applied, no credentials were entered, and no
signup was submitted. Staging backup run #12 successfully restored its plaintext dump to
a disposable PostgreSQL 17.11 database before encryption and uploaded the
encrypted artifact. At the time of this 2026-10-22 snapshot the encrypted
artifact had not yet been restored; that recovery path was subsequently
verified by Staging backup run #25 on 2026-10-25. The hosted schema
reconciliation and Production release blockers below still apply.

The Staging backup workflow uploads the encrypted artifact, downloads it in
the same run, decrypts it, compares the restored dump with the source dump, and
restores it into a disposable PostgreSQL database. Run #25 completed this
round trip successfully for its Staging snapshot. This does not constitute a
restorable Production backup or a durable recovery copy.

A read-only GitHub Actions check on 2026-10-25 confirmed that run #12
([40087589412](https://github.com/raimundus-ciku-koten/AI_nnoe-Learning-Ecosystem/actions/runs/40087589412))
completed successfully and its encrypted artifact was still available. The run
restored the plaintext dump before encryption, then encrypted and uploaded it;
its recorded job steps did not download, decrypt, or restore the uploaded
ciphertext. The artifact is scheduled to expire at 2026-10-25 10:53:43 UTC
(18:53:43 UTC+8). The workflow update that validates the uploaded ciphertext is
present only in this local worktree and has not been run on `main`.

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
Production signup was observed disabled in the historical Auth dashboard
check; the local Supabase Auth configuration also disables signup. Hosted
Auth/functions have not been changed or reverified by this implementation.
Historical billing migrations and fail-closed Edge Function stubs remain for
source/database history and were not purged from hosted systems. The active
web application has no checkout/payment flow or ad integration.

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
verified. The 2026-10-25 Staging relation/history inventory passed for the
then-current 58-relation schema; it is not a Production schema comparison and
does not validate newer migrations. Google features require OAuth setup and
user consent. External AI providers are optional, require a user-supplied key
and explicit disclosure, and may incur provider charges; checkout and payment
are disabled. The package catalog is informational and does not guarantee
package entitlements or feature availability. Public metadata and landing-page
copy should preserve these limitations.

### Ruang Kelas access foundation

Ruang Kelas is now listed immediately after Dashboard for operators, school
admins, superadmins, teachers, and students. Operators (`operator` or
`admin_sekolah`) and superadmins can create a tenant-scoped room and assign
active teacher and student accounts. Teachers and students can read only rooms
to which the operator assigned their account; this is enforced by Supabase
RLS, not only by the menu. The classroom schema and restricted account lookup
are in `supabase/migrations/20261024000100_learning_classrooms.sql`. This
migration has not been applied to a hosted project. Text-based classroom
materials are implemented in the web app and use the tenant-scoped,
teacher-write/member-read policies in
`supabase/migrations/20261024000200_learning_classroom_materials.sql`. That
migration also has not been applied to a hosted project. Teachers can publish
text assignments, students can submit or revise responses before the deadline,
and assigned teachers can grade submissions; these workflows are backed by
`supabase/migrations/20261024000300_learning_classroom_assignments.sql`, which
has not been applied to a hosted project. Teachers can create multiple-choice
quizzes; students receive questions without answer keys, and answers are scored
once by a protected database function. This workflow is in
`supabase/migrations/20261024000400_learning_classroom_quizzes.sql` and has not
been applied to a hosted project. Teachers can create dated attendance sessions
and submit a complete roster with per-student status and notes; students can
read only their own attendance history. Attendance access and writes are
protected by RLS and server-side functions in
`supabase/migrations/20261024000500_learning_classroom_attendance.sql`. This
migration has not been applied to a hosted project. File attachments and
notifications are not yet available in the classroom workflow. Do not deploy
these migrations until the hosted schema and migration baseline have been
reconciled and an approved, recoverable rollout plan is in place.
The school announcement channel is wired to the existing tenant-scoped
`school_announcements` table: admin-school and operator roles can publish,
edit, and delete; active teachers, students, and parent accounts can read.
This is in-app display only and does not send email, push, or chat broadcasts.
Its active-role RLS policy update is in
`supabase/migrations/20261025000700_school_announcement_active_roles.sql`.
Neither that migration nor the existing announcement schema migration has
been applied to the hosted project, so hosted announcement access is not yet
active.
Student menu destinations for `Jadwal dan Tugas` and `Materi` now read the
assigned classes and published classroom work through the same RLS-protected
services. Task and quiz links open the matching classroom activity, and the
schedule page also shows the signed-in student's own attendance history. It
does not claim to provide a full timetable because timetable data is not
connected to the classroom schema.
Teacher submenu `Jurnal Mengajar Harian` now opens a class-linked journal for
assigned teachers, with date, topic, learning objectives, activities,
reflection, and follow-up. Journal entries are private to their author and are
readable/editable only while that active teacher remains assigned to the
classroom; tenant membership, role, and author checks are enforced by RLS.
This module does not replace official attendance, grades, or reports. Its
schema is `supabase/migrations/20261025000800_learning_classroom_journals.sql`
and has not been applied to the hosted project.

Teacher `Realisasi terhadap Rencana` now records an explicit link from a
class journal entry to a document in that teacher's planning archive. The
reference is selected from the signed-in owner's Drive archive, stored with
the existing journal, and can be reopened from the journal history. This is a
manual evidence link, not automatic plan validation, school approval, or an
official realization score.

Diagnostic, formative, and summative assessment menus now create online exams
with a server-stored category. Students see that category beside assigned
exams. Question-bank writes and exam creation require the active teacher to
own the questions and be assigned to a classroom matching the subject and
class. The category does not diagnose students or make academic decisions.
The teacher `Rubrik & Instrumen` route now supports a tenant- and
class-scoped rubric catalog with four validated achievement descriptions per
criterion and append-only versions. Assigned teachers can read rubrics for
their classes; only the author can create a revision. The page does not score
students, store individual assessment evidence, or publish official grades.
Its schema and server-side access controls are in
`supabase/migrations/20261026000300_teacher_rubric_workflows.sql`.

`Profil Belajar Siswa` filters submitted classroom task and quiz evidence by
student within the active teacher's assigned classes. It has no free-text
case, health, counseling, or intervention notes and is not a complete student
record. The metadata, assessment categories, and assignment-scoped question
bank policies are in
`supabase/migrations/20261026000200_teacher_learning_workflows.sql`. This
migration has not been applied to the hosted project; the new links/categories
will not work there until it is reviewed and deployed through the approved
staging process.
The rubric migration is also local-only and requires the same verified backup,
disposable staging validation, schema reconciliation, and explicit approval
before any hosted deployment.

Teacher submenu `Analisis Hasil` and `Laporan Penilaian` now combine submitted
classroom assignments and quiz results for classes assigned to the active
teacher. The view distinguishes ungraded submissions, calculates averages
only from graded work, supports class/activity/student filters, and exports
the filtered results as CSV. It is a classroom-work summary, not an official
report-card, school-wide gradebook, or an automatic pass/fail decision. It
uses the existing teacher-scoped result RPCs, includes up to 100 recent tasks
and 100 recent quizzes per class, and adds no grade data model.

The **Nilai & Capaian Rapor** workflow is now an actual school report-card
record, separate from task/quiz analysis. Teachers enter a final 0–100 score
and learning-achievement description for each student in an assigned
classroom; the system does not calculate the final score. The active academic
year and semester configured at **Data Dasar → Tahun Ajaran & Semester** are
used, and the classroom year must match. Teachers save drafts, school
administrators review and publish them, published cards are read-only until
an administrator reopens them with a recorded reason, and students can read
and print their own published records, including previous periods. Published
cards from past periods are read-only; reopening is limited to the currently
configured year/semester. Parent report access is not enabled because this
project has no verified guardian-to-student relationship model in the
report-card data path.

The schema, audit trail, and role checks are in
`supabase/migrations/20261025000900_school_report_cards.sql`. This migration
has not been applied to the hosted project. Do not claim report cards are
available in hosted production until the existing hosted schema/migration
baseline has been reconciled, the migration is applied through an approved
recoverable rollout, and teacher/admin/student access has been verified there.

The report-card layout has also been expanded from the uploaded 2021/2022 SMA
workbook. School profiles can select TK/PAUD, SD, SMP, or SMA using the
existing tenant education-level field. TK uses a narrative child-development
report based on teacher observation, with no required numeric subject score;
SD/SMP/SMA retain per-subject final scores and achievement descriptions.
The selected level is snapshotted on each semester portfolio so archived
documents keep their original level label.

SMA is the primary structural comparison target for the official e-Rapor SMA
2025.1 release: school/student identity, academic period, subject outcomes,
attendance, co-curricular activity, and homeroom feedback are represented.
This is an independent layout and is **not** an exact copy of the official
template, a Dapodik integration, or a claim of official approval. SD/SMP
subject mappings, curriculum-specific columns, and TK layouts must still be
validated against their current level-specific government requirements before
the reports are used as statutory documents. The SMA-oriented subject results
use learning-achievement descriptions. Legacy KI-1 through KI-4/KKM fields
are not carried forward as mandatory fields, and the school does not infer
passing decisions from a score threshold.

The semester portfolio is a separate record per learner and period, so
kokurikuler and shared report sections are not duplicated for every subject.
It includes descriptive kokurikuler evidence and optional narrative feedback
for the eight graduate-profile dimensions (faith and devotion, citizenship,
critical reasoning, creativity, collaboration, independence, health, and
communication), plus verified attendance counts, extracurriculars, achievements, and teacher/
homeroom notes. These are descriptive fields, not required numeric ratings.
NISN and gender are snapshotted only when the learner account has an explicit
link to the school's student master record; the report does not guess identity
by matching names.
Attendance counts are entered from the school's official attendance register
and may remain blank when a count has not been verified; they are not
automatically inferred from a partial attendance feed. Teachers save both
subject and portfolio drafts for SD/SMP/SMA; TK teachers save the development
narrative portfolio without a numeric subject score. School administrators
publish subject grades first for SD/SMP/SMA and can publish the portfolio only
after every subject classroom registered for that learner and period has a
published result. TK publication instead requires a non-empty development
narrative. Students can view and print only their own published portfolio and
published subject results when the selected level uses them.

This is a policy-informed local report workflow, not an official e-Rapor
client, Dapodik integration, or claim of exact template compatibility.
Reference points checked for this design:

- [Permendikdasmen No. 13 Tahun 2025](https://peraturan.bpk.go.id/Details/322506/permendikdasmen-no-13-tahun-2025), which remains in force and adjusts curriculum provisions including deep-learning approach and co-curricular learning.
- [Kurikulum Kemendikdasmen: Pembelajaran Mendalam](https://kurikulum.kemendikdasmen.go.id/pembelajaran-mendalam), including its principles, learning experiences, and eight graduate-profile dimensions.
- [Direktorat SMA: e-Rapor SMA](https://sma.kemendikdasmen.go.id/erapor), which identifies e-Rapor SMA version 2025.1 as its latest release on 1 May 2026.

The added portfolio schema, role checks, and publication audit are in
`supabase/migrations/20261025001000_school_report_card_portfolios.sql`. This
migration also has not been applied to the hosted project; production
availability remains unverified pending the approved schema reconciliation
and rollout described above.

School profile now has an optional address field for the printed report
header, added in `supabase/migrations/20261025001100_tenant_report_card_address.sql`.
It reuses the existing tenant-administrator update policy and remains optional
so historic schools are not blocked from reporting.

Teacher submenu **Laporan Harian s.d. Bulanan** now summarizes stored journals
written by the signed-in teacher and attendance sessions for assigned
classrooms. It supports class/date filters, daily or monthly grouping, and CSV
export. The report reads existing classroom records only, is limited to the
100 newest journals and 100 newest attendance sessions per class, and does
not replace a school-wide or statutory report.

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
The catalog is retained for internal reference but is no longer shown on the
public login page or user-facing package page. Those pages state that there is
no in-app checkout or advertising and clarify that this does not guarantee
zero operating costs for the service owner or third-party providers.
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
microphone/camera permission. Calls use Supabase Realtime for signaling and a
public STUN server by default. Networks that block direct peer connections
also need a TURN service. Set `VITE_WEBRTC_ICE_SERVERS` to a JSON array of ICE
server objects during the web build when TURN is required. Because this
variable is delivered to browsers, use only short-lived, restricted TURN
credentials; never put a long-lived provider secret in a `VITE_*` variable.

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

A fresh read-only Staging check on 2026-10-24 confirmed eight public base
tables, all with RLS enabled, and nine public policies. Of the 30 feature
relations listed in the inventory query used for that dated check, only
`trial_registrations` existed.
The migration-history relation is still absent. The checkout also does not
contain the documented `school_registration_requests_v2` migration or a
privacy-consent migration; locate and review the intended source before
planning either change. This inventory checked schema metadata only and did
not read application rows or change the database.

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
`billing_plans`, `personal_entitlements`, `payment_orders`,
`testimonial_submissions`, `question_bank`, `web_push_subscriptions`, and
`chat_push_dispatches`. The same check found that migration history is still
absent.
The Supabase Database → Backups dashboard was also inspected read-only on
2026-10-18 and states that the Free Plan does not include project backups.
Scheduled hosted backups therefore cannot be used as the recovery copy for this
cutover without upgrading, which is not allowed. Workflow run #12 later restored
the Staging dump to a disposable database before encryption and uploaded the
ciphertext. That artifact itself still needs a decrypt/restore check; do not
mutate hosted schema or data until the encrypted recovery artifact and current
Staging schema/provenance have been verified.
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
first edge function”; `chat-push`, `midtrans-checkout`, and `midtrans-webhook`
are not deployed to this project. Do not rely on chat push or automated
checkout/webhooks until their reviewed source, secrets, provider configuration,
and end-to-end behavior have been deployed and verified.

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

The approved `profiles` mapping currently has a local, report-only checker at
`scripts/reconcileProfiles.mjs`. It accepts a minimal JSON input containing
Firebase Auth identities, Firestore `users`/`directory` rows, Supabase Auth
identities, existing profiles, and (when needed) a manually verified
`tenantCrosswalk`. Firebase `tenantId` claims take precedence; `sekolahId` is
accepted only through an explicit crosswalk. It never auto-links a missing
`legacy_uid`, even when emails match; those accounts require separate admin
verification and manual onboarding/linking. The checker never calls Firebase
or Supabase and does not update any database. The CLI prints only counts and
reason codes, while its in-memory report contains no source email addresses.

Do not create exports or run this checker against real account data without
separate approval. Keep any input files local, minimal, access-restricted, and
out of version control; never include password hashes, tokens, secrets, or
unnecessary profile fields. Unverified or ambiguous identities and role,
tenant, or active-state conflicts are quarantined rather than modified.

The approved `public.tenants` mapping has a separate checker at
`scripts/reconcileTenants.mjs`. Its local input uses Firestore document IDs,
the four tenant fields, a manually verified source-to-target ID crosswalk,
and target tenant rows. It reports existing matches, conflicts, and missing
target tenants; it never writes to Supabase. Because the sampled source schema
has no tenant `active` field, new tenant creation remains pending until an
active status is independently verified. The source `jenjang` attribute has
no target column and is not migrated by this identity-focused mapping.

The tenant profile mapping is separately approved and has an additive local
schema migration at `supabase/migrations/20261017000700_tenant_profile_fields.sql`
and a report-only checker at `scripts/reconcileTenantProfiles.mjs`. It maps
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

The approved `platformAudit` mapping has a report-only checker at
`scripts/reconcilePlatformAudit.mjs` and a local additive schema migration
`20261017000400_platform_audit_legacy_context.sql`. The checker creates
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
creation/import; the barcode screen no longer exposes the legacy Firebase
post-hoc code writer. This schema has not been applied to the hosted project,
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
must not be treated as backend enforcement. The client MFA gate and maintenance
exception use the active role selected for the current session, so multi-role
accounts do not inherit privileged behavior from an inactive role. The standalone
`platformControlAdapter` test helper is not the active UI integration.

The planning teacher directory now reads active teacher profiles from Supabase.
Planning packages now use one end-to-end encrypted Google Drive file per
package. Package contents, generated documents, and modules are encrypted in
the browser; Supabase is used only for the public-key directory. Teachers own
and edit their packages. A same-tenant school admin can decrypt a package only
after its teacher explicitly grants access to that admin's key; the admin then selects the shared file in Google Picker to
grant the app per-file Drive access. Revocation
removes the key envelope before the Drive reader permission; copies already
opened or downloaded by an admin cannot be recalled. The old Firestore
packages have not been imported and remain a separate reconciliation task.
Migration `20261018000600_planning_drive_vault.sql` is local and has not been
applied to hosted Supabase; public-key registration and admin discovery need
that migration deployed first.
The browser AI menu now defaults to local Qwen 2.5 7B Instruct (q4f16) through
WebLLM. Its first download is approximately 4.5 GB and WebLLM estimates about
5.1 GB of GPU memory; actual requirements depend on browser and device. Qwen
2.5 1.5B remains available as a smaller local alternative. On browsers reporting
4 GB system memory or less, new local preferences recommend 1.5B; otherwise they
recommend 7B. This coarse system-memory signal is not a VRAM measurement or a
guarantee of compatibility, and saved user preferences are preserved. Model
files are fetched only after explicit user action and cached by the browser;
WebGPU support and sufficient device memory are required. WebLLM now runs in a
dedicated web worker so model loading and inference do not execute on the UI
thread; this does not reduce the model/runtime download size. The model setup
flow confirms the expected download and browser storage use before starting,
reports WebGPU availability and download progress, and lets the user cancel.
If 7B initialization fails, the UI offers the smaller model without switching
automatically. Browser-reported system memory is only a coarse recommendation;
the app cannot verify free VRAM or guarantee a model will load. The optional
third choice accepts a user's own Gemini, DeepSeek, or
Groq key in tab memory only. It sends prompts to that provider only after the
user accepts the disclosure and selects the provider, and provider fees or
quotas are not guaranteed to be zero. The AI preference must also be enabled
by the platform administrator. ATP, KKTP, and Modul Ajar can be drafted with
the prepared local model or, after explicit transfer/cost confirmation, a
configured external provider. Prompts use the encrypted package's subject,
target grade, phase CP, schedule, and age-sensitive learning profile. Generated
output is schema-checked and saved as an editable draft; teacher review remains
required. When a phase covers multiple grades, official CP text is preserved
verbatim and ATP goals for the selected class are a pedagogical proposal, not
an official ministry-issued per-grade CP breakdown. Create one package for
each target class. For CP, a teacher explicitly selects a matching PDF with
Google Picker. The browser extracts and checks the selected subject and phase,
then stores the CP text and source metadata in the teacher's end-to-end
encrypted Drive package; the source PDF is not copied. Review extracted CP
text and use the latest official reference before relying on it.
RPE records the scheduled JP for each selected weekday. A holiday now removes
only the JP assigned to that day, and Prosem uses each week's actual remaining
capacity. Existing planning packages without per-day values remain readable;
when edited, their weekly JP is distributed across the selected weekdays.
Unlike the connected Apps Script project, which uses a static/cache CP registry
and Gemini-backed generation, this web flow keeps the selected PDF as the CP
source of record. Teachers can also author and revise KKTP criteria per
canonical ATP goal and Modul Ajar content per unit and meeting using structured
manual editors. Both documents are validated against the ATP and saved as
end-to-end encrypted revisions; optional module sections may remain empty.
Local AI drafting requires the platform's `aiGeneration` control and a model
prepared by the user. Existing saved documents remain readable and printable
whether the AI control is enabled or not.

New Teacher Workspace notes now use the end-to-end encrypted Google Drive
vault. Supabase is queried only for entitlement metadata; note contents and
original filenames are encrypted in the browser before upload. The page
explicitly warns that legacy Firestore entries have not been imported and will
not appear in the Drive list. `scripts/reconcileTeacherWorkspace.mjs` remains
report-only and requires a verified encrypted Drive artifact per legacy entry;
it is not an importer or proof that old records were moved. The active page
uses the encrypted vault and warns that legacy entries have not been imported.
Keep the legacy source until an encrypted import is completed and reconciled.

Teacher schedules now use a per-user end-to-end encrypted Google Drive vault;
the active schedule page no longer reads Firestore and keeps warning that legacy
schedule entries have not been imported. Revision checks prevent ordinary
stale-update overwrites, but Google Drive does not make the metadata check and
upload atomic. `scripts/reconcileTeacherSchedule.mjs` is report-only; retain the
Firestore source until an encrypted import has been completed and reconciled.

Teacher seating plans now use a per-user end-to-end encrypted Google Drive
vault as well. Class names, student IDs, seats, and group assignments stay
inside the encrypted payload; the page warns that Firestore plans have not been
imported. The vault stores one revision containing all classes for that user,
so a stale revision is rejected rather than silently overwriting another
device's update. `scripts/reconcileTeacherSeating.mjs` remains report-only; keep
the legacy source until an encrypted import is completed and reconciled.

The legacy `scripts/reconcileQuestionBank.mjs` report-only checker describes
the superseded encrypted-Drive proposal and is not used by the active Bank Soal
runtime. The current table preserves the established tenant staff read and
teacher-owner write permissions with Supabase RLS. Existing Firebase questions
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

The application is not yet Firebase-free. The active Data Siswa list and
write paths now use Supabase, but its schema is local and existing roster data
still requires reconciliation/import. The dashboard reads recent chat previews from the RLS-protected Supabase
`chat_inbox` view and no longer imports Firebase. The teacher dashboard reads
today's schedule from the encrypted Google Drive vault when the user's Google
session and vault key are available; it links to Workspace settings otherwise.
Pending tasks now come from assigned Ruang Kelas and link to the matching task.
Recent teacher-workspace notes are read from the encrypted Drive vault, limited
to five entries per dashboard load. The teacher dashboard's score tile shows
the rounded average of quiz submissions in the five newest assigned classrooms;
it does not claim to measure semester progress.

### Kop sekolah, impor siswa, dan hasil tinjauan perencanaan

Data Dasar menyediakan unggah/pratinjau kop sekolah berbentuk gambar untuk
tenant aktif. Guru dan operator sekolah yang diizinkan dapat mengelolanya;
superadmin memilih tenant tujuan. RPE, ATP, Prota, Prosem, KKTP, dan Modul
memakai kop tersebut ketika dirender. Migrasi penyimpanan dan RLS ada di
`supabase/migrations/20261025001200_school_letterheads.sql` dan belum
diterapkan ke Supabase hosted.

Data Siswa menerima `.xlsx` serta CSV/TXT yang sudah didukung. Impor Excel
menggunakan lembar pertama, membatasi berkas hingga 1 MB, isi hasil ekstraksi
hingga 5 MB, dan maksimal 200 baris termasuk judul; berkas `.xls` lama dan
sel rumus ditolak. Semua berkas tetap melalui pratinjau dan validasi sebelum
disimpan. Admin sekolah/operator memilih guru aktif dalam tenant sebagai
pemilik roster; superadmin memilih tenant aktif lalu guru tujuan. Guru melihat
roster miliknya, sedangkan administrator dapat mengelola roster pada tenant
yang berwenang. Kebijakan dan RPC pengelola ada di
`supabase/migrations/20261025001300_student_roster_assignment.sql`; migrasi
ini belum diterapkan ke Supabase hosted.

Dokumen perencanaan yang sudah dibuat dapat ditinjau dan teksnya diedit,
sedangkan tahun ajaran serta identitas guru/kepala sekolah tetap terkunci.
Tinjauan disimpan sebagai override terpisah di paket Drive terenkripsi dan
tidak mengubah payload perhitungan. **Unduh PDF** membuka dialog cetak
peramban; pengguna memilih "Simpan sebagai PDF". Hasil tidak diberi watermark
atau DRM, dan aplikasi tidak dapat mencegah PDF dikonversi oleh perangkat
pihak ketiga.

Suara pembuka dan notifikasi menggunakan text-to-speech sistem dengan suara
berlokal tepat `id-ID`, setelah interaksi pengguna mengaktifkan suara. Aplikasi
menggunakan pelafalan nama merek “Ainnoe” agar lebih alami. Suara berlokal
lain, termasuk `id-MY`, tidak digunakan sebagai pengganti. Jika suara `id-ID`
belum tersedia, notifikasi menunggu daftar suara perangkat diperbarui dan
kontrol memberi tahu pengguna; aksen dan intonasi tetap bergantung pada suara
`id-ID` yang dipasang di peramban atau sistem operasi, sehingga tidak dapat
dijamin sama di semua perangkat. Peramban juga membatasi pemutaran otomatis
tanpa interaksi. Overlay proses memakai animasi logo, tetapi ini bukan audio
latar yang dijamin berjalan saat halaman pertama dibuka.

The school-admin dashboard shortcuts now open the available user directory,
Ruang Kelas, planning archive, online assessment, and chat modules instead of
presenting unimplemented monitoring destinations as active workflows.
Teacher assignments are read from Supabase `profiles.mapel_ids` and
`profiles.kelas_ids`; the legacy root Firestore `penugasan` collection was
empty in the read-only console snapshot on 2026-10-17.
Planning packages have moved off the active Firestore runtime, but legacy
Firestore packages have not been imported. Legacy Teacher Workspace, schedule,
and seating entries also remain in Firestore pending encrypted import, although
their active pages no longer read those sources. Other Firebase services,
configuration, backend functions, and legacy feature code remain in the
repository; the application must not be described as Firebase-free yet. The
active browser application no longer imports the Firebase Web SDK or retains
the unused Firebase client shims. The unused FCM service worker has been
removed.
This only completes the frontend client cleanup: Firebase Functions/Admin SDK,
legacy data, and hosted Firebase services have not been retired or fully
verified as unused. Root Firebase deployment/emulator configuration, the
default Firebase project alias, and the local Spark deploy helper have been
removed. The
Bank Soal runtime
now reads and writes the tenant-scoped Supabase `question_bank` table with RLS:
teachers and school admins can read within their tenant, while only an entitled
teacher can change their own questions. Its migration is local and existing
question records still need a controlled import. The Firebase service console
panel and navigation group have been removed from platform operations;
controls and access summaries use Supabase. The planning teacher
directory and school subscription status now read Supabase
profiles/entitlements. The planning generator uses local AI by default; an
external-provider action is offered only after disclosure, with a user-owned
key and potential provider costs. This does not enable platform checkout or
billing. The personal entitlement and Midtrans billing schema is
local only and still requires deployment and payment-flow verification.
Remaining backing schemas, authorization, data migration, and production
verification must be completed before removing Firebase configuration or
services.

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

The Firebase and Supabase consoles were inspected without exporting records or
changing production settings. The Firebase project showed 3 Auth users,
15.2 MB Hosting downloads over 7 days, 1.84 MB Realtime Database downloads
over 7 days, 450 bytes of current Realtime Database storage, and 171 current
Firestore reads. Cloud Monitoring reported 501 bytes of Firestore data and
index storage at the sample time. The Cloud Storage bucket size, object count,
and billing plan remain unverified. These are point-in-time dashboard values,
not an export estimate.

The Supabase project is on the Free Plan. Its usage page showed a 25.46 MB
database size against the included 0.5 GB/project limit, with 0 GB Storage,
0 GB egress, 0 monthly active users, and 0 Edge Function invocations for the
selected period. Quotas are organization-wide for billing and may include
other projects. These readings do not establish that a full import or normal
production traffic will remain free. In particular, Cloud Storage size and
object counts, identity mappings, Google Drive quotas, and export/import
traffic still need a read-only inventory and cost review.
The Dashboard Backups page was checked on 2026-10-18 and confirms that the
Free Plan does not include scheduled project backups. Workflow run #12
(`40087589412`) on 2026-10-24 successfully dumped Staging and restored the
plaintext dump to a disposable Supabase PostgreSQL 17.11 database, detecting
47 user tables, before encrypting and uploading the artifact. Run #25
subsequently verified decryption and restore of the uploaded ciphertext for
its Staging snapshot. The one-day artifact is not a durable
recovery copy and does not cover Production. Obtain and verify a restorable
Production backup before hosted schema or data mutations.

The selected target keeps identity, role, tenant, school/class/guardian access
indexes, Drive file IDs and ciphertext metadata, security audit entries, and
tenant entitlements in Supabase. Other application payloads are intended to
live as end-to-end encrypted files in each user's own Google Drive. File
owners may share a file only with school users whose access is verified by the
server; Drive permissions and encrypted per-recipient data-key envelopes must
be revoked together. Supabase must never receive plaintext document contents
or private encryption keys. Optional personal AI keys are held only in tab
memory and sent directly to a selected third-party provider only after explicit
user acknowledgement; they are never stored in Supabase or localStorage.
Third-party API usage may incur charges and is not covered by the app's
zero-cost operation. Canva OAuth tokens remain unavailable until a trusted
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
read Firebase, upload files, or write to Supabase, and the current workspace
page is not wired to this migration flow.

The approved public testimonial projection has a local migration at
`supabase/migrations/20261017000800_public_testimonials.sql` and a report-only
checker at `scripts/reconcilePublicTestimonials.mjs`. It requires a matching
published, consented moderation record, stores no raw source UID, exposes only
published and consented rows to anonymous readers, and reserves writes for
`service_role`. Pending/rejected submissions and the moderation UI remain
separate work; the migration and checker have not been applied to Supabase
hosted or run against exported source records.

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
using this flow. The checker remains report-only: keep Firestore sources until
every legacy package has been imported and reconciled.

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
`scripts/reconcileWebPushSubscriptions.mjs` is report-only: Firebase FCM
registration tokens cannot be transformed into Web Push subscriptions, so the
checker quarantines them without printing token or user identifiers. Devices
must opt in again. The `chat-push` Supabase Edge Function validates the
authenticated sender and message, delivers a generic notification to other
conversation participants, and removes expired endpoints. The chat client
invokes it after a successful message insert; push failures are logged without
misreporting the already-saved message as failed. Deploy the function and set
`VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`, and `VAPID_SUBJECT` as Supabase secrets;
set the matching public key as `VITE_WEB_PUSH_PUBLIC_KEY` in each frontend
environment. Hosted delivery and old FCM-token retirement are not verified.
Dispatch claims are unique per message so retrying the endpoint cannot repeat
notifications; failed individual deliveries are logged but are not retried.

Workspace permissions now use Google's Identity Services token flow directly
instead of linking Google as a Firebase Auth provider; the short-lived token is
managed by a separate Workspace service and scoped to the Supabase-authenticated
app user. Configure `VITE_GOOGLE_OAUTH_CLIENT_ID` with a public Web OAuth
client ID and register each exact local/production origin in the Google OAuth
client settings. Configure `VITE_GOOGLE_API_KEY` with a browser API key
restricted to the required web origins and Google Picker/Drive APIs. Neither
value is a client secret. The Google account email must match the signed-in
Supabase account.

### Cutover and zero-cost gate

A full Firebase-to-Supabase migration cannot be guaranteed to remain free:
Firestore exports and reads, Cloud Storage backup/storage/egress, Supabase
usage, and deployment traffic may incur charges or exceed free quotas. Do not
run Firebase or cloud export/backup commands for this project. A zero-cost
target is a constraint to verify, not a guarantee of any provider's free tier.

No-upgrade operating constraint:

- Do not attach a billing account, enable Firebase Blaze, upgrade Supabase or
  Vercel, or configure paid API credentials for this project. Firebase
  deployment, emulator, and rules-test aliases have been removed from npm
  scripts. Legacy Firebase code remains only as uninvoked migration/recovery
  material; do not run Firebase CLI commands or deploy it.
- Firebase Functions and large cloud exports are not part of the zero-billing
  path. The owner declined R2 because of potential charges. The manual
  Staging-only encrypted backup workflow is now on `main`; run #12 completed
  successfully, but Actions storage usage and billing limits remain
  account-dependent and must be checked before future runs.
- Vercel Hobby eligibility and quotas must be checked against current terms.
  Do not use that plan for a monetized/commercial deployment unless its terms
  explicitly permit the use; do not upgrade to resolve a restriction.
- Midtrans charges merchant transaction fees, and external AI APIs can incur
  charges or change their free quotas. They are optional integrations, not
  zero-cost guarantees. Do not configure live payment credentials or
  billable/shared AI keys under a no-billing constraint.
- Provider API keys are issued by their providers, not generated by this app.
  A provider's free quota or eligibility is not guaranteed. Local WebLLM models
  are the default. Optional personal API keys are stored only in tab memory
  and prompts are sent to a selected provider only after user acknowledgement;
  opening an official provider portal does not enable an integration.
- Checkout is disabled both in the purchase UI and in the client service; the
  app does not create orders or redirect to Midtrans. Ad display and automatic
  AdSense script loading are disabled regardless of environment variables.
- Free-tier limits and provider terms can change. When a limit would require
  an upgrade, stop that feature rather than upgrading, enabling billing, or
  attempting to bypass the provider's limit.

### Free-tier recovery and operations

The `main` workflow is Staging-only and manual-only; it rejects non-`main`
runs, creates a custom-format PostgreSQL dump, restores it to a disposable
Supabase PostgreSQL 17.11 database, encrypts it with AES-256-GCM, caps the
artifact at 400 MiB, and retains it for one day. Run #12
(`40087589412`) completed successfully on 2026-10-24, restoring 47 user tables
before encryption and uploading artifact
`supabase-staging-encrypted-40087589412` (352,895 bytes; SHA-256
`c8cb1fd888833e4c0f3a8b3f0f08c0a64488645f8698b106bf257fc333f68c5b`). The
uploaded ciphertext itself has not yet been downloaded, decrypted, and
restored. This short-lived artifact is not a durable recovery copy and does
not guarantee zero cost: check Actions storage usage and billing limits before
future runs.

| GitHub setting | Value |
| --- | --- |
| Secret `SUPABASE_DB_URL` | PostgreSQL direct or session-pooler URL for Staging project `samszhfyhbjuculrcffg`; never the transaction pooler URL. The workflow validates the target. |
| Secret `BACKUP_ENCRYPTION_KEY` | Base64 encoding of 32 cryptographically random bytes. Generate locally with `node -p "require('node:crypto').randomBytes(32).toString('base64')"` and store only as a GitHub secret. |

Configure both secrets directly in GitHub Actions settings; never send their
values through chat or commit them. Before future manual runs, verify current
Actions storage usage and billing settings. Run #12's artifact expires
2026-10-25 10:53:43 UTC. Decrypt and restore the uploaded ciphertext in a
disposable PostgreSQL instance before any hosted schema/data mutation. Staging
migrations also remain blocked until the hosted schema and migration
provenance are freshly reconciled.

The workflow does not run on a schedule, configure R2, or touch Production.
GitHub Actions free quotas and billing behavior are account-dependent. Backup
credentials are exposed only to the validation and dump/encryption steps;
they are not passed to checkout, PostgreSQL client installation, or artifact
upload.

The encryption utility is tested for round-trip integrity, wrong keys, and
tampering (`npm --prefix web run test:backup`). Workflow run #12 separately
restored the generated dump before encryption; it did not decrypt and restore
the uploaded artifact itself. Before any hosted schema/data mutation, download
the ciphertext to a trusted machine, decrypt it only into a protected
temporary directory, restore into a disposable local Supabase stack using the
matching PostgreSQL major version, and verify representative schema, Auth
rows, and application records. Repeat this restore drill quarterly. Never
commit a dump, decryption key, database URL, or R2 credentials. The document's
additional Google Drive copy is still a manual operational step: no refresh
token or service-account credential is stored by this application or workflow.

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
The owner has instructed that Firebase no longer be used. No Firebase CLI,
Admin SDK, emulator, deployment, or cloud export commands are to be run from
this repository. This leaves data reconciliation and safe hosted retirement
blocked; no hosted data export or production cutover has been run from this
workspace.

For local setup, copy `web/.env.example` to `web/.env.local`, then set
`VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY`. For Vercel, set the same
variables in the project's Development, Preview, and Production environments.
The frontend key must be the Supabase anon/publishable key; never expose a
`service_role` key in the browser or a `VITE_*` variable. Configure database
access with RLS before wiring application data to Supabase.

### GitHub and Vercel

Push the repository to GitHub and import it into Vercel. Set the Vercel project
Root Directory to `web`; `web/vercel.json` supplies the Vite build and output
settings. The repository-root `vercel.json` also supports the monorepo root by
installing dependencies from `web/package-lock.json` and building `web/`.
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

### Legacy data and Firebase retirement

The active frontend no longer imports Firebase SDKs. The root Firebase CLI
configuration and local deploy helper, plus deployment, emulator, and
rules-test npm aliases, have been removed. Do not invoke Firebase CLI,
Firebase Admin, Cloud Functions, or Firebase deployment commands.

Legacy Firebase Functions source is retained only as migration reference; its
entry points throw before loading Firebase SDKs. It is not an application
service and must not be deployed. The Supabase project still lacks required
feature tables/functions, and no restore-tested backup or completed data
reconciliation has been verified. Therefore, this repository cannot yet
promise that hosted Firebase services have been shut down or that all former
Firebase-backed features are available on Supabase. Do not delete the legacy
source or change hosted services in this step; the owner must first confirm an
independent recovery copy and complete the Supabase cutover. Never attach
billing or enable a paid plan to perform that work.

The 2026-10-18 local audit found no Firebase packages in the root or web
dependency trees, no Firebase imports/endpoints in the active web source or
production bundle, and no active Firebase deployment configuration. Old
installable Android APK/AAB outputs have been preserved with a `.disabled`
suffix; do not restore their package extensions or distribute them. Historical
Firebase rules, offline reconciliation utilities, and feature snapshots remain
for migration analysis only and are not runtime dependencies.

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
| `functions/` | Inert legacy Firebase Functions source retained for cutover inventory; not used or deployed by the active application. |
| `scripts/` | Historical migration utilities; Firebase mutators fail closed and are not part of the active workflow. |
| `tests-rules/` | Archived Firebase Security Rules sources; active test entry points fail closed and do not launch emulators. |
| `android-apk/` | TWA source; APK builds require an owner-provided non-Firebase `TWA_HOST` and matching Digital Asset Links configuration. |
| `firestore.rules`, `firestore.indexes.json`, `storage.rules` | Historical Firebase rules retained for migration analysis, not active application policy. |
| `database/`, `dataconnect/` | Historical Firebase configuration/assets retained for migration analysis. |
| `reference/feature-packs/` | Preserved feature-package snapshots; not part of the active frontend or deployment workflow. |
| `reference/legacy-root-app/` | Unused root-level frontend snapshot, retained for reference and excluded from the app build. |
| `reference/legacy-firebase/` | Unused alternative Firebase bootstrap helpers; not imported by the active app. |
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

Run from the workspace root. These commands do not invoke Firebase:

```powershell
npm run dev
npm run build
npm test
```

Frontend-specific tests and builds can also be run with
`npm --prefix web run test` or `npm --prefix web run build`. Firebase-specific
source and tests are retained for migration analysis but intentionally have no
active npm run or deploy aliases.

## Package status and Google Workspace

The historical package catalog in `functions/shared/pricing.json` supplies the
public informational price list. Annual amounts are shown alongside a monthly
equivalent calculated using the catalog divisor; the monthly amount is not a
checkout or billing option. Each package links to the owner’s public WhatsApp
contact with a package-specific inquiry message. The contact number is public
application data, not a secret.

The purchase page and public login landing page display prices and WhatsApp
contact only; there is no public account signup, trial registration, order
creation, checkout, or payment flow. Supabase local Auth signup is disabled in
`supabase/config.toml`. Historic account/trial records, billing migrations,
and fail-closed payment stubs are retained as source/database history; they
were not purged from hosted systems. Do not configure payment secrets, apply
the historical billing migration to a hosted project, or deploy payment
components. Hosted functions have not been updated or verified; no claim is
made about hosted payment state.

## Google AdSense for web/PWA

Ad display, ad scripts, publisher identifiers, and the static `ads.txt`
publisher file have been removed from the active web application. Do not add
ad-serving integrations under the no-billing requirement.

The Android project is a Trusted Web Activity (TWA) for this same web/PWA, not
a native AdMob app. Advertising is not configured in the active application.
Do not add publisher scripts, IDs, or SDK integrations under the no-ad
requirement.
See [DEPLOYMENT_GUIDE.md](./DEPLOYMENT_GUIDE.md) for the current no-billing
deployment boundary. `functions/README.md` is an archival inventory only;
its legacy merchant setup instructions must not be followed.

Google Workspace is available only to provisioned application users. Each user
can link their own same-email Google account from **Pengaturan → Google
Workspace**. On the first protected sign-in, a per-account consent screen lists
the supported Drive, Sheets, and Meet connections. Saving that preference does
not connect an account or grant an OAuth token; each connection still requires
a separate user action and provider approval. Drive requests basic identity
and the `drive.file` scope. Sheets requests the service-specific
`spreadsheets` scope. Google Meet requests `meetings.space.created` only when
the user explicitly creates a meeting. Direct Calendar event creation and
Google Tasks creation request `calendar.events` and `tasks` respectively, only
after separate consent; short-lived tokens stay in page memory. Calendar
template links remain available without API access. Gmail permissions are not
requested. AI defaults to local WebLLM models. Optional Gemini, DeepSeek, or
Groq personal keys are held only in tab memory and are used only after the user
accepts the provider disclosure and selects one; they are not stored in Drive.
Menu Builder lets superadmins disable menu groups or individual
submenus for an active account; this frontend navigation control does not
replace backend RLS or data authorization. The application router also denies
direct URLs that are not listed for the active role, and the Menu Builder lets
superadmins select which assigned role's menu they are configuring for a
multi-role account. These client-side checks are defense in depth, not a
substitute for server-side authorization.

Enable the Google Drive, Google Sheets, Google Meet, Google Calendar, and
Google Tasks REST APIs used by the features you enable, configure the OAuth
consent screen and authorized web origins, and set `VITE_GOOGLE_OAUTH_CLIENT_ID`. Google Picker also needs a
public API key in `VITE_GOOGLE_API_KEY`, restricted to the allowed web origins
and Picker/Drive APIs. External Google Cloud settings and any required OAuth
review are owner-managed; deploying this repository alone does not enable
access. OAuth verification status and Workspace administrator policy can still
affect real accounts, so test with representative `belajar.id` accounts before
rolling out.

The optional Google Sheets export asks for basic identity and the
`https://www.googleapis.com/auth/spreadsheets` OAuth scope separately. The
export creates a new sheet from user-pasted TSV data, uses `RAW` cell input to
prevent formula execution, and keeps the access token only in page memory.
Review the current Google OAuth verification requirements for the deployed
project. Each Google OAuth grant requests only the scopes needed for that
action; previously granted scopes are not automatically accumulated. No
Google account or API key is bundled with the app.
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
profile fields rather than the legacy Firestore assignment document; subjects
and classes are presented as separate lists because the target schema does not
store an explicit subject-to-class pairing. Existing assignments still require
verified provisioning before cutover.

Planning packages and documents are stored as encrypted files in Google Drive.
Teachers own and edit their packages; school administrators can read a package
only after its owner explicitly shares both Drive access and a key envelope.
Supabase stores public encryption keys and access metadata, not package
plaintext or private keys. Legacy Firestore planning records still require
controlled import and reconciliation; Firestore Rules are not the authorization
boundary for the active Drive vault.

Teacher schedules and seating plans also use encrypted Google Drive vault
files. The schedule page and teacher dashboard do not read legacy Firestore
records; importing/reconciling those records remains pending.

The **Cari Orang** directory and chat contacts use provisioned Supabase
profiles under tenant RLS. New identities are managed through the protected
`manage_platform_user` RPC; pending identities remain allowlisted until they
confirm their Supabase Auth email. The obsolete Firebase `seed.js` and
`setRole.js` utilities, including their default demo passwords and role-change
commands, have been removed. Remaining Realtime Database directory scripts are
retained only for controlled legacy-data migration and must not be used for
new Supabase accounts.

The active question bank is available at **Asesmen dan Penilaian → Bank Soal**.
Questions are stored in the RLS-protected Supabase `question_bank` table;
teachers and school administrators can read questions in their tenant, only the
owning teacher can create, edit, or delete them, and students cannot read the
table because it contains answer keys. AI-generated question drafts and Canva
question-link creation are not available in no-billing mode.

The profile-menu **AI & Layanan** action opens **Pengaturan → AI & Layanan**.
Local WebLLM is the default for AI workflows and must be explicitly prepared
on the device. Planning workflows also offer an external-provider path only
after a user configures a personal key and accepts the transfer and
possible-cost disclosure. The former server-side
encrypted-key and Canva OAuth endpoints remain only in the legacy Firebase
Functions source and are not called by the active frontend. Word chat
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
Submenu destinations without a dedicated data module now include a personal
work-notes space for non-demo, non-superadmin roles. Notes are scoped in
`private_workspace_records` to the authenticated user, active role, tenant,
menu path, and menu query; row-level security enforces that scope. The module
supports create, edit, delete, status, target dates, search, and filtering.
Notes are not encrypted and are not official grades, attendance, reports, or
student communications; do not enter student-identifying or other sensitive
information. The schema is defined in
`supabase/migrations/20261025000600_private_workspace_records.sql` and must be
applied and verified before this module can store hosted data. This workspace
is a usable personal productivity feature, not a substitute for domain-specific
workflows that are not yet implemented.

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

## Legacy Firebase configuration boundaries

The root Firebase deployment configuration, default project alias, and deploy
helper have been removed. Legacy `functions/`, Firebase rules, migration
utilities, archived feature snapshots, and Firebase-related source remain as
migration material.
They are not used by the active browser application; hosted services and legacy
data cannot honestly be called retired until separately verified. No npm
script exposes Firebase deployment, emulator, or rules-test operations. Do not
run Firebase CLI/Admin SDK commands or add Firebase settings to
`web/.env.local`. Configure the active frontend only from
`web/.env.example`; keep all provider secrets out of source control.

### Production release checks

The active frontend authenticates with Supabase and uses a separate Google
Identity Services OAuth grant for Google Workspace. Configure the Supabase
project URL and publishable/anon key, the approved Google OAuth client ID, and
the restricted Google Picker API key for the deployed origin. Never expose a
Supabase service-role key, Google client secret, Firebase service-account
credentials, or payment/provider secrets through `VITE_*` variables.

The Android TWA no longer defaults to Firebase Hosting. Its Gradle build
requires `TWA_HOST` (or `-PtwaHost`) to name the deployed non-Firebase HTTPS
hostname; a matching `/.well-known/assetlinks.json` must also be published for
the signing certificate before the APK can be trusted as a TWA. Until the
owner supplies that domain and verifies Digital Asset Links, do not build or
release the APK. `android-apk/twa-manifest.json` intentionally contains an
invalid placeholder and is not a deployable Bubblewrap manifest.

Before deploying, verify these project-level settings in Supabase and Google
Cloud Console; they cannot be enabled by this repository:

1. Supabase Auth is the current web login provider. Configure its Google OAuth
   provider and redirect URLs. Google Workspace access is granted separately
   through the direct OAuth flow and must be limited to the required scopes.
2. The active browser app uses Supabase Auth and data services and does not
   import the Firebase Web SDK. Firebase Functions/Admin SDK, rules, migration
   scripts, archived feature snapshots, and legacy data remain in the
   repository but are deliberately not invoked. Root Firebase deployment
   configuration has been removed. Hosted Firebase retirement is unverified and
   cannot be completed from this workspace without owner-authorized access and
   a migration/recovery plan.
3. Web Push subscriptions are stored in Supabase and the `chat-push` Edge
   Function is implemented locally. Its hosted deployment and VAPID
   configuration must be verified before relying on delivery. The legacy
   Firebase FCM/Realtime Database token workflow is not the active replacement.
4. Crashlytics and App Distribution apply only if native Android/iOS Firebase
   SDKs or release workflows are intentionally retained. The Android package
   is a Trusted Web Activity; this web build does not initialize Firebase
   Performance Monitoring or Firebase AI Logic.
5. The AI assistant and question drafts use local WebLLM by default and remain
   gated by superadmin feature controls. Users may optionally supply a personal
   API key for Gemini, DeepSeek, or Groq; prompts go directly to the chosen
   provider only after an explicit disclosure, and provider costs/quotas are
   outside the zero-cost guarantee. Keys exist only in tab memory. ATP, KKTP,
   and Modul Ajar prompts use the encrypted package's grade, phase CP, and
   schedule context; official CP remains verbatim while grade-specific
   learning goals are teacher-reviewed proposals. Canva OAuth and server-side AI Firebase
   callables remain legacy Functions; the active frontend does not call them.
6. Do not enable Firebase Blaze, attach billing, run Firebase CLI commands, or
   deploy legacy Firebase functions. Existing Firebase payment, platform
   administration, server-side AI, media conversion, and chat-trigger code
   must not be assumed retired merely because the current frontend no longer
   calls some legacy endpoints.
7. Run `npm test` and `npm run build` for the active web application. Review
   Supabase migrations and target-project configuration before deployment;
   do not resolve a free-plan restriction by upgrading or enabling billing.

### Legacy callable retirement inventory

Historical Firebase Functions source in `functions/index.js` and
`functions/chat-functions.js` is disabled at its entry points and must not be
deployed. The following names are retained for migration inventory only:

- `notifikasiPesanBaru` and `buatChat`: legacy Realtime Database/FCM chat
  paths. Supabase `chat-push` is the local push replacement; verify the
  Supabase chat creation flow and deployed push delivery before retiring either.
- `buatPembayaran`, `buatPembayaranPaket`, and `midtransWebhook`: legacy
  checkout/webhook paths. The local Supabase `midtrans-checkout` and
  `midtrans-webhook` functions return HTTP 410 and are deliberately not
  replacements for an active billing flow. The
  `finalize_midtrans_payment` routine is a historical/local schema artifact.
  Do not configure, deploy, or rely on payment components under the no-billing
  requirement. `buatPembayaran` explicitly rejects its retired per-seat flow.
  See `DEPLOYMENT_GUIDE.md`; older merchant setup instructions in
  `functions/README.md` are archival and must not be followed.
- `getAIProviderConnections`, `savePersonalAIProviderKey`,
  `removePersonalAIProviderKey`, `setAIProviderPreference`,
  `generateQuestionDraft`, `generatePerangkat`, and `chatAsisten`: legacy
  server-side AI/settings callables. The browser AI flow does not call or
  replace them; it uses local WebLLM by default and optional personal API keys
  directly from the browser after user acknowledgement.
- `startCanvaOAuth`, `canvaOAuthCallback`, and `createCanvaQuestionDesign`:
  Canva server OAuth/design paths remain legacy; no Supabase Edge replacement
  is present in `supabase/functions/`.
- `setPlatformControl` and `createPlatformUser`: legacy platform callables.
  Supabase migrations define `set_platform_control` and `manage_platform_user`
  database routines, but their hosted deployment, authorization, and user
  lifecycle parity remain unverified.

This inventory is source-level only. It does not establish which functions are
currently deployed or receiving traffic. Because Firebase is no longer to be
used, do not inspect or invoke those services from this workflow. The legacy
source remains a warning that hosted Firebase resources may still exist; their
retirement is blocked until Supabase data/features are reconciled and an
owner-approved recovery path exists. The Vercel configuration is present, but
production frontend cutover and required hosted Supabase Edge Functions and
migrations remain unverified.

## Android APK

The Android package is a Trusted Web Activity for the hosted web app. The
The previous APK/AAB artifacts predate the non-Firebase host guard and may
still open the Firebase Hosting URL. Their contents are preserved locally with
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
after deploying the app to a non-Firebase domain. Do not use the invalid
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
hosted schema and migration history remain unreconciled, and the uploaded
encrypted backup artifact has not itself been restored; do not apply the
migration or deploy these routes to production until those operational gates
have been completed. Static schema checks and frontend tests do not replace
applying the migration to a disposable Supabase/PostgreSQL instance and
testing role boundaries, RPCs, timers, submission retries, and essay grading
end to end.

## Maintenance conventions

- Keep generated output, dependencies, emulator logs, and local credentials out
  of application source folders.
- Put a new screen under its product area in `web/src/pages/`; reusable
  presentation belongs in `web/src/components/`; new auth/data integrations
  should follow the active Supabase or Google Workspace service patterns.
- Do not add or invoke Firebase client/server dependencies or services. Keep
  retained Firebase code inert as migration reference only; complete any
  eventual data cutover through reviewed, no-cost export/import tooling.
- Keep Cloud Function provider secrets server-side and put reusable function
  logic in `functions/lib/`.
- Treat `reference/feature-packs/` as migration/reference material. Promote
  code into the active application explicitly rather than importing from an
  archived package.
