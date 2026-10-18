import test from 'node:test';
import assert from 'node:assert/strict';
import { reconcilePlatformAudit } from '../../scripts/reconcilePlatformAudit.mjs';

const makeInput = overrides => ({
  firestoreAuditEntries: [{
    documentId: 'legacy-audit-1',
    data: {
      action: 'platform.user.provisioned',
      actorUid: 'firebase-actor-1',
      createdAt: '2026-01-01T00:00:00Z',
      role: 'guru',
      target: 'legacy-target-1',
      tenantId: 'legacy-school-1',
    },
  }],
  profiles: [{
    id: '00000000-0000-4000-8000-000000000001',
    legacy_uid: 'firebase-actor-1',
  }],
  targetAudits: [],
  ...overrides,
});

test('produces a stable audit row and links actors by legacy UID', () => {
  const first = reconcilePlatformAudit(makeInput());
  const second = reconcilePlatformAudit(makeInput());
  assert.equal(first.mode, 'report-only');
  assert.equal(first.proposals.length, 1);
  assert.match(first.proposals[0].id, /^[0-9a-f-]{36}$/);
  assert.equal(first.proposals[0].id, second.proposals[0].id);
  assert.equal(first.proposals[0].actor_id, '00000000-0000-4000-8000-000000000001');
  assert.equal(first.proposals[0].before_value, null);
  assert.equal(first.proposals[0].after_value, null);
  assert.deepEqual(first.proposals[0].legacy_context, {
    actorUid: 'firebase-actor-1',
    role: 'guru',
    tenantId: 'legacy-school-1',
  });
});

test('preserves an unresolved actor in legacy context without inventing an actor FK', () => {
  const report = reconcilePlatformAudit(makeInput({ profiles: [] }));
  assert.equal(report.proposals[0].actor_id, null);
  assert.equal(report.observations[0].reason, 'actor_legacy_uid_unlinked');
  assert.equal(report.proposals[0].legacy_context.actorUid, 'firebase-actor-1');
});

test('recognizes an already imported deterministic row and quarantines collisions', () => {
  const proposal = reconcilePlatformAudit(makeInput()).proposals[0];
  const alreadyImported = reconcilePlatformAudit(makeInput({
    targetAudits: [{
      ...proposal,
      legacy_context: {
        tenantId: 'legacy-school-1',
        role: 'guru',
        actorUid: 'firebase-actor-1',
      },
    }],
  }));
  assert.equal(alreadyImported.summary.alreadyPresent, 1);
  assert.equal(alreadyImported.proposals.length, 0);

  const collision = reconcilePlatformAudit(makeInput({
    targetAudits: [{ ...proposal, target: 'other' }],
  }));
  assert.equal(collision.quarantined[0].reason, 'deterministic_target_id_collision');
});

test('quarantines invalid profile UUIDs instead of emitting an invalid foreign key', () => {
  const report = reconcilePlatformAudit(makeInput({
    profiles: [{ id: 'not-a-uuid', legacy_uid: 'firebase-actor-1' }],
  }));
  assert.equal(report.proposals.length, 0);
  assert.equal(report.quarantined[0].reason, 'actor_profile_id_invalid');
});

test('quarantines invalid actions, targets, dates, and context types', () => {
  const scenarios = [
    [{ action: 'N/A' }, 'action_or_target_missing'],
    [{ target: 'x'.repeat(161) }, 'action_or_target_invalid'],
    [{ createdAt: 'invalid' }, 'created_at_missing_or_invalid'],
    [{ role: 7 }, 'legacy_context_type_invalid'],
  ];
  for (const [changes, reason] of scenarios) {
    const input = makeInput({
      firestoreAuditEntries: [{
        ...makeInput().firestoreAuditEntries[0],
        data: { ...makeInput().firestoreAuditEntries[0].data, ...changes },
      }],
    });
    assert.equal(reconcilePlatformAudit(input).quarantined[0].reason, reason);
  }
});

test('keeps raw legacy values out of report metadata', () => {
  const report = reconcilePlatformAudit(makeInput());
  assert.equal(JSON.stringify(report.quarantined).includes('firebase-actor-1'), false);
  assert.equal(JSON.stringify(report.observations).includes('legacy-school-1'), false);
});

test('requires all input collections', () => {
  assert.throws(() => reconcilePlatformAudit({}), /must be an array/);
});
