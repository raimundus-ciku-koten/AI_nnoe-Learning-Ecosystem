const {
  HttpError,
  adminRequest,
} = require('./common.js');
const {
  accessTokenForConnection,
  getConnection,
  requestGoogle,
} = require('./google.js');

const EVENT_ID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const ALLOWED_ACTIONS = new Set(['created', 'updated', 'deleted']);
const ALLOWED_FIELDS = new Set([
  'tanggal', 'kelas', 'mapel', 'jam', 'materi', 'kegiatan',
  'kendala', 'tindakLanjut', 'status',
]);
const RETENTION_MS = 365 * 24 * 60 * 60 * 1000;
const AUDIT_KIND = 'lesson-journal-audit-v1';
const DRIVE_API = 'https://www.googleapis.com/drive/v3';
const DRIVE_UPLOAD_API = 'https://www.googleapis.com/upload/drive/v3';

function validasiEventAudit(input, userId, now = Date.now()) {
  if (!input || typeof input !== 'object' || Array.isArray(input) ||
      Object.keys(input).sort().join(',') !== 'action,changedFields,eventId,journalId,occurredAt') {
    throw new HttpError(400, 'Format catatan audit tidak valid.', 'journal_audit_invalid');
  }
  if (!EVENT_ID.test(input.eventId || '') || !EVENT_ID.test(input.journalId || '') ||
      !ALLOWED_ACTIONS.has(input.action)) {
    throw new HttpError(400, 'Identitas atau aksi catatan audit tidak valid.', 'journal_audit_invalid');
  }
  if (!Array.isArray(input.changedFields) ||
      input.changedFields.length < 1 ||
      input.changedFields.length > ALLOWED_FIELDS.size ||
      input.changedFields.some((field) => !ALLOWED_FIELDS.has(field)) ||
      new Set(input.changedFields).size !== input.changedFields.length) {
    throw new HttpError(400, 'Daftar field catatan audit tidak valid.', 'journal_audit_fields_invalid');
  }
  if (typeof input.occurredAt !== 'string' ||
      !Number.isFinite(Date.parse(input.occurredAt)) ||
      new Date(input.occurredAt).toISOString() !== input.occurredAt) {
    throw new HttpError(400, 'Waktu catatan audit tidak valid.', 'journal_audit_time_invalid');
  }
  const occurredAt = Date.parse(input.occurredAt);
  if (occurredAt > now + 5 * 60 * 1000) {
    throw new HttpError(400, 'Waktu catatan audit tidak boleh berada jauh di masa depan.', 'journal_audit_time_invalid');
  }
  if (occurredAt < now - RETENTION_MS) {
    throw new HttpError(410, 'Catatan audit sudah melewati masa simpan satu tahun.', 'journal_audit_expired');
  }
  return {
    user_id: userId,
    event_id: input.eventId.toLowerCase(),
    journal_id: input.journalId.toLowerCase(),
    action: input.action,
    changed_fields: [...input.changedFields].sort(),
    occurred_at: input.occurredAt,
    status: 'pending',
  };
}

function queryAuditFiles(userId, eventId = '') {
  const predicates = [
    `appProperties has { key='aleKind' and value='${AUDIT_KIND}' }`,
    `appProperties has { key='aleOwner' and value='${userId}' }`,
    'trashed=false',
  ];
  if (eventId) predicates.push(`appProperties has { key='aleEventId' and value='${eventId}' }`);
  return new URLSearchParams({
    q: predicates.join(' and '),
    pageSize: '1',
    fields: 'files(id,createdTime,appProperties)',
  }).toString();
}

async function unggahEventKeDrive(userId, event) {
  const connection = await getConnection(userId, 'drive');
  const accessToken = await accessTokenForConnection(connection);
  const existing = await requestGoogle(
    `${DRIVE_API}/files?${queryAuditFiles(userId, event.event_id)}`,
    { headers: { Authorization: `Bearer ${accessToken}` } },
  );
  if (Array.isArray(existing.data?.files) && existing.data.files.length) {
    return existing.data.files[0];
  }

  const metadata = {
    name: `AI_nnoe-Jurnal-Audit-${event.event_id}.json`,
    mimeType: 'application/json',
    appProperties: {
      aleKind: AUDIT_KIND,
      aleOwner: userId,
      aleEventId: event.event_id,
    },
  };
  const auditRecord = {
    versi: 1,
    idPeristiwa: event.event_id,
    idJurnal: event.journal_id,
    aktor: userId,
    aksi: event.action,
    fieldBerubah: event.changed_fields,
    waktu: event.occurred_at,
  };
  const form = new FormData();
  form.append('metadata', new Blob([JSON.stringify(metadata)], {
    type: 'application/json; charset=utf-8',
  }));
  form.append('file', new Blob([JSON.stringify(auditRecord)], {
    type: 'application/json',
  }), metadata.name);
  const uploaded = await requestGoogle(
    `${DRIVE_UPLOAD_API}/files?uploadType=multipart&fields=id,createdTime,appProperties`,
    {
      method: 'POST',
      headers: { Authorization: `Bearer ${accessToken}` },
      body: form,
    },
  );
  if (!uploaded.data?.id) {
    throw new HttpError(502, 'Google Drive tidak mengonfirmasi penyimpanan catatan audit.', 'journal_audit_drive_response_invalid');
  }
  return uploaded.data;
}

async function kirimEventAudit(row) {
  if (row.occurred_at && Date.parse(row.occurred_at) < Date.now() - RETENTION_MS) {
    await adminRequest(
      `lesson_journal_audit_outbox?user_id=eq.${encodeURIComponent(row.user_id)}&event_id=eq.${encodeURIComponent(row.event_id)}`,
      {
        method: 'PATCH',
        body: {
          status: 'expired',
          expired_at: new Date().toISOString(),
          next_retry_at: null,
          last_error_code: 'journal_audit_expired',
          journal_id: null,
          action: null,
          changed_fields: null,
          occurred_at: null,
        },
      },
    );
    return { status: 'expired' };
  }

  try {
    await unggahEventKeDrive(row.user_id, row);
    await adminRequest(
      `lesson_journal_audit_outbox?user_id=eq.${encodeURIComponent(row.user_id)}&event_id=eq.${encodeURIComponent(row.event_id)}`,
      {
        method: 'PATCH',
        body: {
          status: 'delivered',
          delivered_at: new Date().toISOString(),
          next_retry_at: null,
          last_error_code: null,
          journal_id: null,
          action: null,
          changed_fields: null,
          occurred_at: null,
        },
      },
    );
    return { status: 'delivered' };
  } catch (error) {
    const attemptCount = (row.attempt_count || 0) + 1;
    const delaySeconds = Math.min(24 * 60 * 60, 60 * (2 ** Math.min(attemptCount - 1, 10)));
    await adminRequest(
      `lesson_journal_audit_outbox?user_id=eq.${encodeURIComponent(row.user_id)}&event_id=eq.${encodeURIComponent(row.event_id)}`,
      {
        method: 'PATCH',
        body: {
          attempt_count: attemptCount,
          next_retry_at: new Date(Date.now() + delaySeconds * 1000).toISOString(),
          last_error_code: String(error.code || 'journal_audit_delivery_failed').slice(0, 80),
        },
      },
    );
    return { status: 'pending', code: error.code || 'journal_audit_delivery_failed' };
  }
}

async function hapusAuditKedaluwarsaDrive(userId, now = Date.now()) {
  const connection = await getConnection(userId, 'drive');
  const accessToken = await accessTokenForConnection(connection);
  const cutoff = new Date(now - RETENTION_MS).toISOString();
  let deleted = 0;
  const batchLimit = 1000;

  while (deleted < batchLimit) {
    const parameters = new URLSearchParams({
      q: [
        `appProperties has { key='aleKind' and value='${AUDIT_KIND}' }`,
        `appProperties has { key='aleOwner' and value='${userId}' }`,
        `createdTime < '${cutoff}'`,
        'trashed=false',
      ].join(' and '),
      pageSize: String(Math.min(100, batchLimit - deleted)),
      orderBy: 'createdTime asc',
      fields: 'files(id)',
    });
    const page = await requestGoogle(`${DRIVE_API}/files?${parameters}`, {
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    const files = page.data?.files;
    if (!Array.isArray(files)) {
      throw new HttpError(502, 'Google Drive mengembalikan daftar audit yang tidak valid.', 'journal_audit_drive_response_invalid');
    }
    if (!files.length) return { deleted, hasMore: false };
    for (const file of files) {
      if (typeof file.id !== 'string' || !/^[A-Za-z0-9_-]{1,256}$/.test(file.id)) {
        throw new HttpError(502, 'Google Drive mengembalikan ID audit yang tidak valid.', 'journal_audit_drive_response_invalid');
      }
      await requestGoogle(`${DRIVE_API}/files/${encodeURIComponent(file.id)}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${accessToken}` },
      });
      deleted += 1;
    }
  }
  return { deleted, hasMore: true };
}

async function simpanEventAudit(event) {
  await adminRequest('lesson_journal_audit_outbox?on_conflict=user_id,event_id', {
    method: 'POST',
    prefer: 'resolution=ignore-duplicates,return=minimal',
    body: event,
  });
  const rows = await adminRequest(
    `lesson_journal_audit_outbox?user_id=eq.${encodeURIComponent(event.user_id)}&event_id=eq.${encodeURIComponent(event.event_id)}&select=user_id,event_id,journal_id,action,changed_fields,occurred_at,status,attempt_count,next_retry_at&limit=1`,
  );
  const row = rows?.[0];
  if (!row) {
    throw new HttpError(502, 'Catatan audit tidak dapat diverifikasi setelah antre.', 'journal_audit_queue_failed');
  }
  return row;
}

async function prosesAuditTertunda(userId, limit = 25) {
  const rows = await adminRequest(
    `lesson_journal_audit_outbox?user_id=eq.${encodeURIComponent(userId)}&status=eq.pending&select=user_id,event_id,journal_id,action,changed_fields,occurred_at,status,attempt_count,next_retry_at&order=created_at.asc&limit=${limit}`,
  );
  if (!Array.isArray(rows)) {
    throw new HttpError(502, 'Antrean catatan audit tidak valid.', 'journal_audit_queue_failed');
  }
  let delivered = 0;
  let pending = 0;
  for (const row of rows) {
    if (row.next_retry_at && Date.parse(row.next_retry_at) > Date.now()) {
      pending += 1;
      continue;
    }
    const result = await kirimEventAudit(row);
    if (result.status === 'delivered') delivered += 1;
    else if (result.status === 'pending') pending += 1;
  }
  return { delivered, pending };
}

async function hapusOutboxAuditKedaluwarsa(now = Date.now()) {
  const cutoff = new Date(now - RETENTION_MS).toISOString();
  await adminRequest(
    `lesson_journal_audit_outbox?created_at=lt.${encodeURIComponent(cutoff)}`,
    { method: 'DELETE', prefer: 'return=minimal' },
  );
}

module.exports = {
  AUDIT_KIND,
  RETENTION_MS,
  hapusAuditKedaluwarsaDrive,
  hapusOutboxAuditKedaluwarsa,
  kirimEventAudit,
  prosesAuditTertunda,
  simpanEventAudit,
  unggahEventKeDrive,
  validasiEventAudit,
};
