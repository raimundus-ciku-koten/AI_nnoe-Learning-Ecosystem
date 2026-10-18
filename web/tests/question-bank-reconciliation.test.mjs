import test from 'node:test';
import assert from 'node:assert/strict';
import { reconcileQuestionBank } from '../../scripts/reconcileQuestionBank.mjs';

const makeInput = overrides => ({
  questionBankEntries: [{
    tenantId: 'legacy-school',
    documentId: 'question-1',
    data: {
      ownerUid: 'legacy-teacher',
      mapel: 'Matematika',
      kelas: 'X',
      jenis: 'pilihan_ganda',
      pertanyaan: 'Berapakah 2 + 2?',
      pilihan: ['3', '4'],
      jawaban: '4',
      pembahasan: '',
      createdAt: '2026-01-01T00:00:00Z',
      updatedAt: '2026-01-02T00:00:00Z',
    },
  }],
  profiles: [{
    id: '11111111-1111-4111-8111-111111111111',
    legacy_uid: 'legacy-teacher',
    role: 'guru',
    tenant_id: 'school-target',
    active: true,
  }],
  tenantCrosswalk: { 'legacy-school': 'school-target' },
  targetTenants: [{ id: 'school-target', active: true }],
  encryptedDriveFiles: [{
    sourceKey: 'legacy-school/question-1',
    driveFileId: 'driveFile123',
    ciphertextSha256: 'a'.repeat(64),
    ciphertextSizeBytes: 1024,
    encryptionVersion: 1,
  }],
  targetDriveFiles: [],
  ...overrides,
});

test('proposes only encrypted assessment metadata for a verified owner and tenant', () => {
  const report = reconcileQuestionBank(makeInput());
  assert.equal(report.mode, 'report-only');
  assert.equal(report.summary.proposals, 1);
  assert.deepEqual(report.proposals[0], {
    owner_id: '11111111-1111-4111-8111-111111111111',
    tenant_id: 'school-target',
    drive_file_id: 'driveFile123',
    category: 'assessment',
    ciphertext_sha256: 'a'.repeat(64),
    ciphertext_size_bytes: 1024,
    encryption_version: 1,
    created_at: '2026-01-01T00:00:00.000Z',
    updated_at: '2026-01-02T00:00:00.000Z',
    revoked_at: null,
  });
  assert.equal(JSON.stringify(report).includes('Berapakah 2 + 2?'), false);
  assert.equal(JSON.stringify(report).includes('legacy-teacher'), false);
});

test('quarantines source schema that does not match active Firestore rules', () => {
  const input = makeInput();
  input.questionBankEntries[0].data.jawaban = '5';
  const report = reconcileQuestionBank(input);
  assert.equal(report.quarantined[0].reason, 'source_question_choices_invalid');

  const extraField = makeInput();
  extraField.questionBankEntries[0].data.tags = ['review'];
  assert.equal(
    reconcileQuestionBank(extraField).quarantined[0].reason,
    'source_question_fields_invalid',
  );
});

test('preserves multiline question text accepted by Firestore Rules', () => {
  const input = makeInput();
  input.questionBankEntries[0].data.pertanyaan = 'Hitung:\n2 + 2';
  const report = reconcileQuestionBank(input);
  assert.equal(report.summary.proposals, 1);
  assert.equal(report.quarantined.length, 0);
});

test('requires verified tenant and active teacher mappings', () => {
  const missingCrosswalk = reconcileQuestionBank(makeInput({ tenantCrosswalk: {} }));
  assert.equal(missingCrosswalk.quarantined[0].reason, 'verified_tenant_crosswalk_missing');

  const inactiveTeacher = makeInput();
  inactiveTeacher.profiles[0].active = false;
  assert.equal(
    reconcileQuestionBank(inactiveTeacher).quarantined[0].reason,
    'owner_profile_not_verified_for_tenant',
  );

  const duplicateTeacher = makeInput();
  duplicateTeacher.profiles.push({ ...duplicateTeacher.profiles[0] });
  assert.equal(
    reconcileQuestionBank(duplicateTeacher).quarantined[0].reason,
    'owner_legacy_uid_not_unique',
  );
});

test('requires one valid encrypted Drive artifact per source question', () => {
  const missing = reconcileQuestionBank(makeInput({ encryptedDriveFiles: [] }));
  assert.equal(
    missing.quarantined[0].reason,
    'encrypted_drive_file_missing_or_ambiguous',
  );

  const invalid = makeInput();
  invalid.encryptedDriveFiles[0].ciphertextSizeBytes = 10489857;
  assert.equal(
    reconcileQuestionBank(invalid).quarantined[0].reason,
    'encrypted_drive_file_metadata_invalid',
  );
});

test('is idempotent for matching target metadata and quarantines target collisions', () => {
  const input = makeInput();
  const proposal = reconcileQuestionBank(input).proposals[0];
  const present = reconcileQuestionBank(makeInput({
    targetDriveFiles: [{ ...proposal }],
  }));
  assert.equal(present.summary.alreadyPresent, 1);
  assert.equal(present.summary.proposals, 0);

  const conflict = reconcileQuestionBank(makeInput({
    targetDriveFiles: [{ ...proposal, ciphertext_sha256: 'b'.repeat(64) }],
  }));
  assert.equal(
    conflict.quarantined[0].reason,
    'target_drive_file_metadata_conflict',
  );
});

test('requires all input collections and verified tenant crosswalk', () => {
  assert.throws(() => reconcileQuestionBank({}), /must be an array/);
  assert.throws(
    () => reconcileQuestionBank({
      questionBankEntries: [],
      profiles: [],
      targetTenants: [],
      encryptedDriveFiles: [],
      targetDriveFiles: [],
      tenantCrosswalk: [],
    }),
    /verified mapping object/,
  );
});
