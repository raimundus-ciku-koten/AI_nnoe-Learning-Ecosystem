import {
  daftarModulSiswaTerenkripsiDrive,
  hapusBerkasVaultDrive,
  unduhBerkasTerenkripsiDrive,
  unggahBerkasTerenkripsiDrive,
} from './googleWorkspace.js';
import {
  validasiBagianModulSiswa,
  validasiInputModulSiswa,
} from './studentModuleAi.js';
import { MODUL_SISWA_BAGIAN } from './studentModuleAiPrompts.js';

const SCHEMA_VERSION = 1;
const RECORD_ID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const DRIVE_FILE_ID = /^[A-Za-z0-9_-]{1,256}$/;
const RECORD_FIELDS = [
  'createdAt',
  'input',
  'ownerUid',
  'recordId',
  'schemaVersion',
  'sections',
  'updatedAt',
];

function validTimestamp(value) {
  return typeof value === 'string' && Number.isFinite(Date.parse(value));
}

function validSectionMetadata(section) {
  if (!section || typeof section !== 'object' || Array.isArray(section) ||
      (section.provider !== undefined &&
      (typeof section.provider !== 'string' || !section.provider.trim() || section.provider.length > 80)) ||
      (section.model !== undefined &&
      (typeof section.model !== 'string' || !section.model.trim() || section.model.length > 120)) ||
      typeof section.fallbackUsed !== 'boolean') {
    throw new TypeError('Metadata penyedia AI pada draf Modul Siswa tidak valid.');
  }
}

function normalizeSections(input, sections) {
  if (!Array.isArray(sections) || sections.length > MODUL_SISWA_BAGIAN.length) {
    throw new TypeError('Daftar bagian draf Modul Siswa tidak valid.');
  }
  const assessmentMarkdown = sections[6]?.markdown || '';
  return sections.map((section, index) => {
    validSectionMetadata(section);
    const validated = validasiBagianModulSiswa(
      JSON.stringify({ markdown: section.markdown }),
      index,
      assessmentMarkdown,
      input,
    );
    return {
      ...validated,
      ...(section.provider ? { provider: section.provider } : {}),
      ...(section.model ? { model: section.model } : {}),
      fallbackUsed: section.fallbackUsed,
    };
  });
}

function normalizedRecord(payload, file, ownerUid) {
  if (!payload || typeof payload !== 'object' || Array.isArray(payload) ||
      Object.keys(payload).sort().join(',') !== RECORD_FIELDS.slice().sort().join(',') ||
      payload.schemaVersion !== SCHEMA_VERSION ||
      payload.ownerUid !== ownerUid ||
      !RECORD_ID.test(payload.recordId || '') ||
      payload.recordId !== file.appProperties?.aleRecord ||
      !validTimestamp(payload.createdAt) ||
      !validTimestamp(payload.updatedAt) ||
      Date.parse(payload.createdAt) > Date.parse(payload.updatedAt)) {
    throw new Error('Struktur draf Modul Siswa terenkripsi tidak valid atau bukan milik akun ini.');
  }
  const input = validasiInputModulSiswa(payload.input);
  const sections = normalizeSections(input, payload.sections);
  return {
    recordId: payload.recordId,
    driveFileId: file.id,
    ownerUid,
    input,
    sections,
    createdAt: payload.createdAt,
    updatedAt: payload.updatedAt,
    ciphertextSha256: file.manifest.ciphertextSha256,
  };
}

function judulDraf(input) {
  return `${input.mapel} · ${input.kelas} · ${input.topik}`;
}

export async function simpanModulSiswaDrive({
  accessToken,
  ownerUid,
  identity,
  input: rawInput,
  sections: rawSections,
  existingRecord = null,
} = {}) {
  if (typeof ownerUid !== 'string' || !ownerUid.trim()) {
    throw new TypeError('Identitas pemilik draf Modul Siswa tidak valid.');
  }
  const input = validasiInputModulSiswa(rawInput);
  const sections = normalizeSections(input, rawSections);
  if (existingRecord &&
      (existingRecord.ownerUid !== ownerUid ||
        !DRIVE_FILE_ID.test(existingRecord.driveFileId || '') ||
        !RECORD_ID.test(existingRecord.recordId || '') ||
        !/^[a-f0-9]{64}$/.test(existingRecord.ciphertextSha256 || '') ||
        !validTimestamp(existingRecord.createdAt))) {
    throw new TypeError('Revisi draf Modul Siswa tidak valid. Muat ulang riwayat Drive sebelum menyimpan.');
  }

  const now = new Date();
  const recordId = existingRecord?.recordId || globalThis.crypto?.randomUUID?.();
  if (!recordId || !RECORD_ID.test(recordId)) {
    throw new Error('Generator ID aman tidak tersedia pada browser ini.');
  }
  const createdAt = existingRecord?.createdAt || now.toISOString();
  const updatedAt = new Date(Math.max(now.getTime(), Date.parse(createdAt))).toISOString();
  const payload = {
    schemaVersion: SCHEMA_VERSION,
    recordId,
    ownerUid,
    createdAt,
    updatedAt,
    input,
    sections,
  };
  if (typeof File !== 'function') {
    throw new Error('Browser ini tidak mendukung berkas terenkripsi. Gunakan browser modern.');
  }
  const file = new File([JSON.stringify(payload)], 'student-module.json', {
    type: 'application/json',
    lastModified: now.getTime(),
  });
  const saved = await unggahBerkasTerenkripsiDrive(
    accessToken,
    ownerUid,
    identity,
    file,
    {
      category: 'student-module',
      ...(existingRecord ? {
        fileId: existingRecord.driveFileId,
        expectedCiphertextSha256: existingRecord.ciphertextSha256,
      } : { recordId }),
    },
  );
  const ciphertextSha256 = saved.manifest?.ciphertextSha256;
  if (!DRIVE_FILE_ID.test(saved.id || '') || !/^[a-f0-9]{64}$/.test(ciphertextSha256 || '')) {
    throw new Error('Google Drive tidak mengembalikan revisi draf Modul Siswa yang valid.');
  }
  return {
    ...payload,
    driveFileId: saved.id,
    ciphertextSha256,
    judul: judulDraf(input),
  };
}

export async function muatModulSiswaDrive(accessToken, ownerUid, identity, pageToken = '') {
  if (typeof ownerUid !== 'string' || !ownerUid.trim()) {
    throw new TypeError('Identitas pemilik riwayat Modul Siswa tidak valid.');
  }
  const result = await daftarModulSiswaTerenkripsiDrive(accessToken, pageToken);
  const entries = [];
  for (let offset = 0; offset < result.files.length; offset += 5) {
    const decrypted = await Promise.all(result.files.slice(offset, offset + 5).map(async (file) => {
      if (file.appProperties?.aleCategory !== 'student-module' ||
          !DRIVE_FILE_ID.test(file.id || '') ||
          !/^[a-f0-9]{64}$/.test(file.manifest?.ciphertextSha256 || '')) {
        throw new Error('Metadata draf Modul Siswa terenkripsi tidak valid.');
      }
      const content = await unduhBerkasTerenkripsiDrive(accessToken, file, identity);
      try {
        const payload = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(content.bytes));
        const record = normalizedRecord(payload, file, ownerUid);
        return {
          ...record,
          judul: judulDraf(record.input),
        };
      } catch (cause) {
        if (cause instanceof SyntaxError) {
          throw new Error('Isi draf Modul Siswa terenkripsi tidak dapat dibaca.', { cause });
        }
        throw cause;
      } finally {
        content.bytes.fill(0);
      }
    }));
    entries.push(...decrypted);
  }
  return { entries, nextPageToken: result.nextPageToken };
}

export async function hapusModulSiswaDrive({
  accessToken,
  ownerUid,
  identity,
  record,
} = {}) {
  if (typeof ownerUid !== 'string' || !ownerUid.trim() ||
      record?.ownerUid !== ownerUid ||
      !DRIVE_FILE_ID.test(record.driveFileId || '') ||
      !RECORD_ID.test(record.recordId || '') ||
      !/^[a-f0-9]{64}$/.test(record.ciphertextSha256 || '')) {
    throw new TypeError('Identitas draf Modul Siswa yang akan dihapus tidak valid.');
  }
  await hapusBerkasVaultDrive(
    accessToken,
    record.driveFileId,
    'student-module',
    identity,
  );
}
