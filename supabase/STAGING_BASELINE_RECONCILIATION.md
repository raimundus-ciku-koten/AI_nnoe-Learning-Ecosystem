# Staging Schema and Migration Provenance Reconciliation

**As of:** 2026-10-28  
**Decision:** Hosted schema changes remain blocked. This record is an inventory, not authorization to apply or stamp migrations.

## Evidence collected

- Read-only Staging schema audit run [#40706044018](https://github.com/raimundus-ciku-koten/AI_nnoe-Learning-Ecosystem/actions/runs/40706044018), run 3, inspected `main` commit `cf2a900418e023f6d4e3d89c217e0d43e66f2329`.
- The audit reports that `supabase_migrations.schema_migrations` is absent.
- 29 of 30 expected feature relations are absent. `trial_registrations` is present; the missing relations are:

  `attendance_records`, `billing_plans`, `chat_contacts`, `chat_conversations`, `chat_inbox`, `chat_messages`, `chat_presence`, `chat_push_dispatches`, `chat_read_receipts`, `drive_file_access`, `drive_file_index`, `drive_file_key_envelopes`, `online_exam_attempts`, `online_exam_items`, `online_exams`, `payment_orders`, `personal_entitlements`, `question_bank`, `school_access_index`, `school_announcements`, `security_audit`, `student_account_link_audit`, `student_account_links`, `students`, `tenant_entitlements`, `testimonial_submissions`, `testimonials`, `user_encryption_keys`, and `web_push_subscriptions`.

- The audit found eight public base tables. It found no public base tables with RLS disabled and no RLS-enabled tables without policies. These are metadata checks only; they do not establish that policy predicates, grants, RPCs, views, or cross-tenant access are safe.
- The successful forward-only rehearsal [#40658859733](https://github.com/raimundus-ciku-koten/AI_nnoe-Learning-Ecosystem/actions/runs/40658859733) replayed a pinned migration on a disposable restore. It did not modify hosted Staging or Production and did not establish the hosted migration history.

## Repository inventory

- `main` commit `cf2a900418e023f6d4e3d89c217e0d43e66f2329` contains 34 SQL migration files. Its `supabase/migrations` Git tree is `3ab593f10f99f55f87b71bf0f2394a4d023c8a6a`.
- All 34 files first appear in commit `bcd4b56941e95c74a3cd81b14af994be8b42d58d` (2026-10-21), whose message is “restore project support files required by web CI.” This commit is repository history, not evidence that these migrations were applied to Staging or Production.
- PR #18 adds `20261028000100_platform_tenant_and_superadmin_provisioning.sql` in commit `d6de1e200ea5182f1d70003fac09db0244f7b7bf`. The PR branch contains 35 migration files; its migrations tree is `346ed48123f09a5f840e6a7a6e4e42fc35aee5cf`.
- `20261018000900_supabase_vault_storage.sql` is zero bytes. Its presence in Git does not establish whether that version was recorded or applied in any hosted environment.

Git object IDs make these repository snapshots reproducible. They do not reconstruct the missing hosted ledger, detect untracked/manual hosted DDL, or prove that the current schema matches the repository.

## Safe next steps

1. Obtain an authoritative Staging schema-only snapshot and migration history from the database owner or retained deployment records. Remove credentials, row data, and other secrets before sharing.
2. Compare the snapshot with every migration and identify manual changes, incompatible legacy objects, extensions, functions, grants, triggers, and RLS policy definitions.
3. Reconcile the history and replay plan on a disposable copy. Do not repair, stamp, or apply a guessed migration ledger to hosted Staging.
4. Verify RLS behavior with isolated test identities and cross-tenant read/write denial tests. A policy count is not a substitute.
5. Require a separately verified Production backup/restore procedure and approved release plan before proposing any Production DDL.

Until these steps are complete, do not run `supabase db push`, migration repair/stamping, or the candidate provisioning migration against a hosted database. Keep PR #18 in draft and keep public signup/trial disabled until their independent CAPTCHA and UAT gates pass.
