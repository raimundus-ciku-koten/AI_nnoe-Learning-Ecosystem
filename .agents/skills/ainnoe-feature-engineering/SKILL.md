---
name: ainnoe-feature-engineering
description: "Use when implementing, debugging, testing, or releasing AI_nnoe Learning Ecosystem features. Prioritize end-to-end working chat, contacts, audio/video calls (including group-call feasibility), and teacher planning workflows over documentation-only responses."
argument-hint: "Describe the user workflow, failure, or feature to implement and how to verify it."
user-invocable: true
disable-model-invocation: false
---

# AI_nnoe Feature Engineering

Deliver production-minded behavior in this repository. A plan or documentation update alone is not a completed feature when implementation is requested.

## Repository baseline

- The active web application is React + Vite in `web/`; it uses Supabase Auth/Postgres/Realtime and has existing role, tenant, feature-flag, storage, and planning layers.
- Read the current implementation and its tests before changing behavior. Reuse existing services and migration conventions.
- The repository may contain dirty files, nested repositories, generated assets, and local secrets. Never revert unrelated work, read secret values, stage broadly, or commit credentials.
- Use the existing Vite scripts and focused test selectors. Do not introduce Next.js or a second app to implement a feature.

## Required implementation workflow

1. Trace the actual user path from navigation and screen through services, Supabase schema/policies, and hosted feature gates. Identify what is implemented, what is disabled, and what depends on hosted schema.
2. Reproduce the reported issue locally or with a focused test before modifying code.
3. Implement the smallest complete fix across every affected UI, service, SQL migration, type, and test surface. Keep existing APIs and compatibility unless a migration explicitly versions a change.
4. For Supabase changes, use the `supabase` and `supabase-postgres-best-practices` skills. Add forward-only migrations; enable RLS on exposed tables; test identity, tenant isolation, unauthorized access, and role transitions. Never treat editable user metadata as authorization.
5. For calling features, test permission denial, device loss, stale sessions, reconnects, multi-tab behavior, call cleanup, and signaling authorization. Do not enable a feature flag until its required schema, private Realtime authorization, credentials, and staging/browser tests exist. Group calling requires an explicit topology/capacity decision: do not advertise mesh as scalable or claim a free hosted SFU.
6. For teacher planning, verify create, edit, validation, autosave/persistence, restore, export/print, keyboard use, responsive layouts, and error/loading/empty states. Never silently report unsaved work as saved.
7. Prefer semantic HTML, keyboard access, visible focus, understandable Indonesian copy, reduced-motion support, and WCAG 2.2 AA-oriented contrast/interaction. Do not claim conformance without an audit.
8. Add regression tests for the observed failure and adjacent security/edge cases. Run focused tests, the relevant full suite, and production build. Use the existing browser tooling to validate real flows when available.
9. Report files changed, behavior verified, commands/results, remaining hosted prerequisites, and rollout safety. Do not deploy, migrate a hosted database, enable public signup, or activate billing without the necessary environment review and explicit release approval.

## Completion criteria

A feature is complete only when its user flow works end-to-end in a testable environment, failures are surfaced safely, access is enforced server-side, regressions are covered, and the relevant build/tests pass. If hosted schema, provider setup, device hardware, or credentials are unavailable, finish all safe local work and state the specific verification that remains; do not imply the feature is fully operational.
