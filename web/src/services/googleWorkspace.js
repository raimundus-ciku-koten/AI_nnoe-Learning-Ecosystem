import { dekripsiBerkasDrive, enkripsiBerkasDrive } from './driveEncryption.js';
import { siapkanCatatanGuru } from './teacherWorkspace.js';
import { bersihBawaan, normalisasiEntri } from '../pages/dataDasar/jadwalUtil.js';
import { MAKS_BERKAS, TIPE_DOKUMEN, TIPE_GAMBAR } from '../utils/chatUtil.js';

const BASE_DRIVE = 'https://www.googleapis.com/drive/v3';
const BASE_UPLOAD = 'https://www.googleapis.com/upload/drive/v3';
const BASE_CALENDAR = 'https://www.googleapis.com/calendar/v3';
const BASE_GMAIL = 'https://gmail.googleapis.com/gmail/v1';
const BASE_SHEETS = 'https://sheets.googleapis.com/v4';
const GOOGLE_API_SCRIPT_URL = 'https://apis.google.com/js/api.js';
const BATAS_BERKAS = 10 * 1024 * 1024;
const BATAS_CIPHERTEXT = 10 * 1024 * 1024 + 4096;
const VAULT_KIND = 'ale-e2e-v1';
const KEY_BACKUP_KIND = 'ale-key-backup-v1';
let googleApiScriptLoading;

async function loadGooglePicker() {
  if (!globalThis.gapi?.load) {
    if (typeof document === 'undefined') {
      throw new Error('Google Picker hanya tersedia di browser.');
    }
    if (!googleApiScriptLoading) {
      googleApiScriptLoading = new Promise((resolve, reject) => {
        const existing = document.querySelector(`script[src="${GOOGLE_API_SCRIPT_URL}"]`);
        const script = existing || document.createElement('script');
        const timeout = setTimeout(() => {
          googleApiScriptLoading = null;
          script.remove();
          reject(new Error('Google Drive Picker tidak merespons.'));
        }, 15000);
        const cleanup = () => {
          clearTimeout(timeout);
          script.removeEventListener('load', loaded);
          script.removeEventListener('error', failed);
        };
        const loaded = () => {
          cleanup();
          if (!globalThis.gapi?.load) {
            googleApiScriptLoading = null;
            reject(new Error('Google API client tidak tersedia setelah dimuat.'));
            return;
          }
          resolve();
        };
        const failed = () => {
          cleanup();
          googleApiScriptLoading = null;
          reject(new Error('Google Drive Picker gagal dimuat. Periksa koneksi atau kebijakan jaringan.'));
        };
        script.addEventListener('load', loaded, { once: true });
        script.addEventListener('error', failed, { once: true });
        if (!existing) {
          script.src = GOOGLE_API_SCRIPT_URL;
          script.async = true;
          script.defer = true;
          document.head.append(script);
        }
      });
    }
    await googleApiScriptLoading;
  }
  if (globalThis.google?.picker) return globalThis.google.picker;
  await new Promise((resolve, reject) => {
    const timeout = setTimeout(() => reject(new Error('Google Picker API tidak merespons.')), 15000);
    try {
      globalThis.gapi.load('picker', () => {
        clearTimeout(timeout);
        if (!globalThis.google?.picker) {
          reject(new Error('Google Picker API tidak tersedia setelah dimuat.'));
          return;
        }
        resolve();
      });
    } catch (error) {
      clearTimeout(timeout);
      reject(error);
    }
  });
  return globalThis.google.picker;
}

export async function bukaPemilihPaketDrive(
  accessToken,
  {
    apiKey = import.meta.env?.VITE_GOOGLE_API_KEY,
    oauthClientId = import.meta.env?.VITE_GOOGLE_OAUTH_CLIENT_ID,
  } = {},
) {
  if (typeof accessToken !== 'string' || !accessToken.trim()) {
    throw new Error('Hubungkan akun Google untuk memilih paket Drive.');
  }
  if (typeof apiKey !== 'string' || !apiKey.trim()) {
    throw new Error('Atur VITE_GOOGLE_API_KEY agar admin dapat memilih paket yang dibagikan.');
  }
  const projectNumber = String(oauthClientId || '').split('-')[0];
  if (!/^\d{5,20}$/.test(projectNumber)) {
    throw new Error('Google OAuth Client ID tidak dapat digunakan untuk membuka Drive Picker.');
  }
  const pickerApi = await loadGooglePicker();
  return new Promise((resolve, reject) => {
    try {
      const view = new pickerApi.DocsView(pickerApi.ViewId.DOCS)
        .setIncludeFolders(false)
        .setMimeTypes('application/octet-stream')
        .setQuery('ALE-Encrypted-');
      const picker = new pickerApi.PickerBuilder()
        .addView(view)
        .setOAuthToken(accessToken)
        .setDeveloperKey(apiKey.trim())
        .setAppId(projectNumber)
        .setTitle('Pilih paket perencanaan yang dibagikan')
        .enableFeature(pickerApi.Feature.MULTISELECT_ENABLED)
        .setCallback((data) => {
          if (data.action === pickerApi.Action.CANCEL) {
            resolve([]);
            return;
          }
          if (data.action !== pickerApi.Action.PICKED || !Array.isArray(data.docs)) return;
          const selectedIds = data.docs.map((file) => file?.id);
          if (selectedIds.some((id) => typeof id !== 'string' ||
              !/^[A-Za-z0-9_-]{1,256}$/.test(id))) {
            reject(new Error('Google Picker mengembalikan pilihan berkas yang tidak valid.'));
            return;
          }
          resolve([...new Set(selectedIds)]);
        })
        .build();
      picker.setVisible(true);
    } catch (error) {
      reject(error);
    }
  });
}

async function requestGoogle(url, token, options = {}) {
  if (typeof token !== 'string' || !token.trim()) throw new Error('Hubungkan akun Google untuk melanjutkan.');
  const response = await fetch(url, {
    ...options,
    headers: {
      Authorization: `Bearer ${token}`,
      ...(options.headers || {}),
    },
    signal: AbortSignal.timeout(30000),
  });
  const raw = await response.text();
  let result = {};
  if (raw) {
    try {
      result = JSON.parse(raw);
    } catch (error) {
      if (response.ok) throw new Error('Respons Google API tidak dapat dibaca.');
    }
  }
  if (!response.ok) {
    const detail = result.error?.message || `Permintaan Google ditolak (HTTP ${response.status}).`;
    const error = new Error(detail);
    error.code = result.error?.status || 'google/api-error';
    error.status = response.status;
    throw error;
  }
  return result;
}

async function requestGoogleBytes(url, token, maxBytes = BATAS_CIPHERTEXT, signal) {
  if (typeof token !== 'string' || !token.trim()) throw new Error('Hubungkan akun Google untuk melanjutkan.');
  if (!Number.isSafeInteger(maxBytes) || maxBytes < 1) {
    throw new TypeError('Batas unduhan terenkripsi tidak valid.');
  }
  const response = await fetch(url, {
    headers: { Authorization: `Bearer ${token}` },
    signal: signal ? AbortSignal.any([AbortSignal.timeout(30000), signal]) : AbortSignal.timeout(30000),
  });
  if (!response.ok) {
    let detail = `Permintaan Google ditolak (HTTP ${response.status}).`;
    try {
      const result = await response.json();
      detail = result.error?.message || detail;
    } catch {
      // The provider may return a non-JSON error body.
    }
    const error = new Error(detail);
    error.code = 'google/api-error';
    error.status = response.status;
    throw error;
  }
  const contentLength = Number(response.headers.get('content-length'));
  if (Number.isFinite(contentLength) && contentLength > maxBytes) {
    throw new Error('Berkas terenkripsi melebihi batas ukuran.');
  }

  if (!response.body?.getReader) {
    const bytes = new Uint8Array(await response.arrayBuffer());
    if (bytes.length > maxBytes) {
      bytes.fill(0);
      throw new Error('Berkas terenkripsi melebihi batas ukuran.');
    }
    return bytes;
  }

  const reader = response.body.getReader();
  const chunks = [];
  let totalSize = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      totalSize += value.byteLength;
      if (totalSize > maxBytes) {
        value.fill(0);
        await reader.cancel('Encrypted file exceeded its allowed size.');
        throw new Error('Berkas terenkripsi melebihi batas ukuran.');
      }
      chunks.push(value);
    }
  } catch (error) {
    chunks.forEach((chunk) => chunk.fill(0));
    throw error;
  } finally {
    reader.releaseLock();
  }

  const bytes = new Uint8Array(totalSize);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
    chunk.fill(0);
  }
  return bytes;
}

function parseVaultDescription(file) {
  if (!file || file.appProperties?.aleKind !== VAULT_KIND ||
      !/^[0-9a-f-]{36}$/i.test(file.appProperties?.aleRecord || '') ||
      typeof file.description !== 'string' || file.description.length > 24000) {
    throw new Error('Metadata vault Drive tidak valid.');
  }
  let manifest;
  try {
    manifest = JSON.parse(file.description);
  } catch (cause) {
    throw new Error('Metadata vault Drive tidak dapat dibaca.', { cause });
  }
  const envelopes = Array.isArray(manifest?.keyEnvelopes)
    ? manifest.keyEnvelopes
    : [manifest?.keyEnvelope];
  const envelopeIds = new Set();
  if (manifest?.version !== 1 ||
      typeof manifest.iv !== 'string' ||
      !/^[a-f0-9]{64}$/.test(manifest.ciphertextSha256 || '') ||
      !Number.isInteger(manifest.ciphertextSizeBytes) ||
      manifest.ciphertextSizeBytes < 1 ||
      manifest.ciphertextSizeBytes > BATAS_CIPHERTEXT ||
      envelopes.length < 1 || envelopes.length > 101 ||
      envelopes.some((envelope) => {
        if (!envelope || typeof envelope.wrappedDataKey !== 'string' ||
            typeof envelope.recipientKeyFingerprint !== 'string' ||
            !/^[a-f0-9]{64}$/.test(envelope.recipientKeyFingerprint) ||
            !Number.isInteger(envelope.keyVersion) || envelope.keyVersion < 1 ||
            (envelope.userId !== undefined &&
              (typeof envelope.userId !== 'string' ||
                envelope.userId.length < 1 || envelope.userId.length > 128 ||
                envelopeIds.has(envelope.userId)))) {
          return true;
        }
        if (envelope.userId) envelopeIds.add(envelope.userId);
        return false;
      })) {
    throw new Error('Metadata kunci vault Drive tidak valid.');
  }
  const envelope = manifest.keyEnvelope || envelopes[0];
  return {
    version: 1,
    iv: manifest.iv,
    ciphertextSha256: manifest.ciphertextSha256,
    ciphertextSizeBytes: manifest.ciphertextSizeBytes,
    keyEnvelope: envelope,
    keyEnvelopes: envelopes,
  };
}

export async function simpanCadanganKunciDrive(accessToken, backup) {
  if (!backup || backup.version !== 1 ||
      backup.algorithm !== 'RSA-OAEP-3072-SHA256' ||
      backup.kdf !== 'HKDF-SHA256' ||
      !/^[a-f0-9]{64}$/.test(backup.fingerprint || '') ||
      typeof backup.publicKey !== 'string' ||
      typeof backup.ciphertext !== 'string') {
    throw new TypeError('Cadangan kunci enkripsi tidak valid.');
  }
  const metadata = new Blob([JSON.stringify({
    name: 'ALE-Recovery-v1.json',
    mimeType: 'application/json',
    appProperties: { aleKind: KEY_BACKUP_KIND, aleFingerprint: backup.fingerprint },
  })], { type: 'application/json; charset=UTF-8' });
  const file = new Blob([JSON.stringify(backup)], { type: 'application/json' });
  const form = new FormData();
  form.append('metadata', metadata);
  form.append('file', file, 'recovery.json');
  return requestGoogle(`${BASE_UPLOAD}/files?uploadType=multipart&fields=id,name,createdTime,appProperties`, accessToken, {
    method: 'POST',
    body: form,
  });
}

export async function daftarCadanganKunciDrive(accessToken) {
  const query = encodeURIComponent(
    `appProperties has { key='aleKind' and value='${KEY_BACKUP_KIND}' } and trashed=false`,
  );
  const result = await requestGoogle(
    `${BASE_DRIVE}/files?q=${query}&pageSize=100&orderBy=createdTime desc&fields=files(id,name,createdTime,appProperties),nextPageToken`,
    accessToken,
  );
  return Array.isArray(result.files) ? result.files : [];
}

export async function pulihkanCadanganKunciDariDrive(accessToken, driveFileId) {
  if (typeof driveFileId !== 'string' || !/^[A-Za-z0-9_-]{1,256}$/.test(driveFileId)) {
    throw new TypeError('ID cadangan Drive tidak valid.');
  }
  const metadata = await requestGoogle(
    `${BASE_DRIVE}/files/${encodeURIComponent(driveFileId)}?fields=id,appProperties,trashed`,
    accessToken,
  );
  if (metadata.trashed ||
      metadata.appProperties?.aleKind !== KEY_BACKUP_KIND ||
      !/^[a-f0-9]{64}$/.test(metadata.appProperties?.aleFingerprint || '')) {
    throw new Error('File bukan cadangan kunci AI_nnoe yang masih tersedia.');
  }
  const bytes = await requestGoogleBytes(
    `${BASE_DRIVE}/files/${encodeURIComponent(driveFileId)}?alt=media`,
    accessToken,
  );
  let backup;
  try {
    backup = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes));
  } catch (cause) {
    throw new Error('Isi cadangan kunci Drive tidak valid.', { cause });
  } finally {
    bytes.fill(0);
  }
  if (backup.fingerprint !== metadata.appProperties.aleFingerprint) {
    throw new Error('Fingerprint cadangan kunci Drive tidak sesuai.');
  }
  return backup;
}

export async function unggahBerkasTerenkripsiDrive(
  accessToken,
  ownerId,
  identity,
  file,
  {
    category = 'other',
    fileId = null,
    expectedCiphertextSha256 = '',
    recipients = null,
    recordId: requestedRecordId = null,
  } = {},
) {
  if (!file || !(file instanceof File)) throw new TypeError('Pilih berkas untuk vault Drive.');
  if (!['other', 'teacher-workspace', 'teacher-schedule', 'teacher-seating', 'planning-package', 'communication'].includes(category)) {
    throw new TypeError('Kategori berkas terenkripsi tidak valid.');
  }
  if (!identity?.publicKey || !identity?.fingerprint ||
      !Number.isInteger(identity.keyVersion) || identity.keyVersion < 1) {
    throw new TypeError('Pulihkan identitas enkripsi Drive terlebih dahulu.');
  }
  let recordId;
  let method = 'POST';
  let destination = `${BASE_UPLOAD}/files?uploadType=multipart&fields=id,name,createdTime,size,description,appProperties`;
  if (fileId !== null) {
    if (typeof fileId !== 'string' || !/^[A-Za-z0-9_-]{1,256}$/.test(fileId)) {
      throw new TypeError('ID berkas Drive tidak valid.');
    }
    const existing = await requestGoogle(
      `${BASE_DRIVE}/files/${encodeURIComponent(fileId)}?fields=id,description,appProperties,trashed`,
      accessToken,
    );
    const existingManifest = parseVaultDescription(existing);
    const ownerEnvelope = existingManifest.keyEnvelopes.find(
      (envelope) => envelope.userId === ownerId,
    ) || existingManifest.keyEnvelope;
    if (existing.trashed ||
        existing.appProperties?.aleCategory !== category ||
        ownerEnvelope.recipientKeyFingerprint !== identity.fingerprint ||
        ownerEnvelope.keyVersion !== identity.keyVersion ||
        existingManifest.ciphertextSha256 !== expectedCiphertextSha256) {
      throw new Error('Berkas Drive tidak cocok dengan kategori atau kunci pemilik aktif.');
    }
    if (!/^[a-f0-9]{64}$/.test(expectedCiphertextSha256)) {
      throw new TypeError('Revisi ciphertext saat ini wajib diberikan untuk memperbarui berkas.');
    }
    recordId = existing.appProperties.aleRecord;
    method = 'PATCH';
    destination = `${BASE_UPLOAD}/files/${encodeURIComponent(fileId)}?uploadType=multipart&fields=id,name,createdTime,size,description,appProperties`;
  } else {
    if (requestedRecordId !== null &&
        (typeof requestedRecordId !== 'string' ||
          !/^[0-9a-f-]{36}$/i.test(requestedRecordId))) {
      throw new TypeError('ID rekaman vault tidak valid.');
    }
    recordId = requestedRecordId || globalThis.crypto?.randomUUID?.();
    if (!recordId) throw new Error('Generator ID aman tidak tersedia pada browser ini.');
  }
  const fileBytes = new Uint8Array(await file.arrayBuffer());
  let encrypted;
  try {
    const daftarPenerima = recipients ?? [{
      userId: ownerId,
      publicKey: identity.publicKey,
      fingerprint: identity.fingerprint,
      keyVersion: identity.keyVersion,
    }];
    if (!Array.isArray(daftarPenerima) ||
        !daftarPenerima.some((recipient) => recipient?.userId === ownerId)) {
      throw new TypeError('Pemilik wajib menjadi penerima kunci berkas terenkripsi.');
    }
    encrypted = await enkripsiBerkasDrive({
      name: file.name,
      mimeType: file.type || 'application/octet-stream',
      lastModified: file.lastModified,
      bytes: fileBytes,
    }, ownerId, daftarPenerima);
  } finally {
    fileBytes.fill(0);
  }
  const keyEnvelopes = encrypted.keyEnvelopes.map((envelope) => ({
    userId: envelope.userId,
    wrappedDataKey: envelope.wrappedDataKey,
    recipientKeyFingerprint: envelope.recipientKeyFingerprint,
    keyVersion: envelope.keyVersion,
  }));
  const manifest = {
    version: encrypted.version,
    iv: encrypted.iv,
    ciphertextSha256: encrypted.ciphertextSha256,
    ciphertextSizeBytes: encrypted.ciphertextSizeBytes,
    keyEnvelopes,
    keyEnvelope: keyEnvelopes.find((envelope) => envelope.userId === ownerId),
  };
  const metadata = new Blob([JSON.stringify({
    name: `ALE-Encrypted-${recordId}.bin`,
    mimeType: 'application/octet-stream',
    description: JSON.stringify(manifest),
    appProperties: { aleKind: VAULT_KIND, aleRecord: recordId, aleCategory: category },
  })], { type: 'application/json; charset=UTF-8' });
  const payload = new Blob([encrypted.ciphertext], { type: 'application/octet-stream' });
  encrypted.ciphertext.fill(0);
  const form = new FormData();
  form.append('metadata', metadata);
  form.append('file', payload, 'encrypted.bin');
  const saved = await requestGoogle(destination, accessToken, { method, body: form });
  return { ...saved, recordId, manifest };
}

export async function daftarBerkasTerenkripsiDrive(accessToken) {
  const query = encodeURIComponent(
    `appProperties has { key='aleKind' and value='${VAULT_KIND}' } and trashed=false`,
  );
  const result = await requestGoogle(
    `${BASE_DRIVE}/files?q=${query}&pageSize=100&orderBy=createdTime desc&fields=files(id,name,description,createdTime,size,appProperties),nextPageToken`,
    accessToken,
  );
  return (Array.isArray(result.files) ? result.files : []).map((file) => ({
    ...file,
    manifest: parseVaultDescription(file),
  }));
}

export async function daftarCatatanKerjaTerenkripsiDrive(accessToken, identity, pageToken = '') {
  if (pageToken && (typeof pageToken !== 'string' || pageToken.length > 2048)) {
    throw new TypeError('Penanda halaman Drive tidak valid.');
  }
  const filters = [
    `appProperties has { key='aleKind' and value='${VAULT_KIND}' }`,
    "appProperties has { key='aleCategory' and value='teacher-workspace' }",
    'trashed=false',
  ];
  const parameters = new URLSearchParams({
    q: filters.join(' and '),
    pageSize: '50',
    orderBy: 'modifiedTime desc',
    fields: 'files(id,name,description,createdTime,size,appProperties),nextPageToken',
  });
  if (pageToken) parameters.set('pageToken', pageToken);
  const result = await requestGoogle(`${BASE_DRIVE}/files?${parameters}`, accessToken);
  if (!Array.isArray(result.files)) {
    throw new Error('Google Drive tidak mengembalikan daftar catatan terenkripsi yang valid.');
  }
  const files = result.files.map((file) => {
    if (file.appProperties?.aleCategory !== 'teacher-workspace') {
      throw new Error('Kategori catatan terenkripsi tidak valid.');
    }
    return { ...file, manifest: parseVaultDescription(file) };
  });
  const entries = [];
  for (let offset = 0; offset < files.length; offset += 5) {
    const decrypted = await Promise.all(files.slice(offset, offset + 5).map(async (file) => {
      const content = await unduhBerkasTerenkripsiDrive(accessToken, file, identity);
      try {
        const entry = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(content.bytes));
        const fields = [
          'modulePath', 'moduleLabel', 'judul', 'tanggal', 'kelas', 'mapel',
          'isi', 'status', 'createdAt', 'updatedAt',
        ];
        if (!entry || typeof entry !== 'object' || Array.isArray(entry) ||
            Object.keys(entry).sort().join(',') !== fields.slice().sort().join(',') ||
            typeof entry.createdAt !== 'string' ||
            typeof entry.updatedAt !== 'string' ||
            !Number.isFinite(Date.parse(entry.createdAt)) ||
            !Number.isFinite(Date.parse(entry.updatedAt)) ||
            Date.parse(entry.createdAt) > Date.parse(entry.updatedAt)) {
          throw new Error('Isi catatan kerja terenkripsi tidak valid.');
        }
        return {
          id: file.id,
          ...siapkanCatatanGuru(entry),
          createdAt: entry.createdAt,
          updatedAt: entry.updatedAt,
          ciphertextSha256: file.manifest.ciphertextSha256,
        };
      } catch (cause) {
        if (cause instanceof SyntaxError) {
          throw new Error('Isi catatan kerja terenkripsi tidak dapat dibaca.', { cause });
        }
        throw cause;
      } finally {
        content.bytes.fill(0);
      }
    }));
    entries.push(...decrypted);
  }
  return { entries, nextPageToken: result.nextPageToken || null };
}

export async function daftarPaketPerencanaanTerenkripsiDrive(
  accessToken,
  selectedFileIds = [],
  { includeCreatedFiles = true } = {},
) {
  if (!Array.isArray(selectedFileIds) || selectedFileIds.length > 200 ||
      selectedFileIds.some((id) => typeof id !== 'string' ||
        !/^[A-Za-z0-9_-]{1,256}$/.test(id)) ||
      typeof includeCreatedFiles !== 'boolean') {
    throw new TypeError('Daftar paket Drive pilihan tidak valid.');
  }
  const files = [];
  const fileIds = new Set();
  if (includeCreatedFiles) {
    const parameters = new URLSearchParams({
      q: [
        `appProperties has { key='aleKind' and value='${VAULT_KIND}' }`,
        "appProperties has { key='aleCategory' and value='planning-package' }",
        'trashed=false',
      ].join(' and '),
      pageSize: '100',
      orderBy: 'modifiedTime desc',
      fields: 'files(id,name,description,createdTime,modifiedTime,size,appProperties),nextPageToken',
    });
    let pageToken = '';
    do {
      if (pageToken) parameters.set('pageToken', pageToken);
      const result = await requestGoogle(`${BASE_DRIVE}/files?${parameters}`, accessToken);
      if (!Array.isArray(result.files) || files.length + result.files.length > 200) {
        throw new Error('Daftar paket terenkripsi tidak valid atau melebihi batas.');
      }
      for (const file of result.files) {
        if (file.appProperties?.aleCategory !== 'planning-package') {
          throw new Error('Kategori paket terenkripsi tidak valid.');
        }
        files.push({ ...file, manifest: parseVaultDescription(file) });
        fileIds.add(file.id);
      }
      pageToken = result.nextPageToken || '';
    } while (pageToken);
  }
  for (const fileId of new Set(selectedFileIds)) {
    if (fileIds.has(fileId)) continue;
    if (files.length >= 200) throw new Error('Jumlah paket yang dapat diakses melebihi batas aman.');
    const file = await requestGoogle(
      `${BASE_DRIVE}/files/${encodeURIComponent(fileId)}?fields=id,name,description,createdTime,modifiedTime,size,appProperties,trashed`,
      accessToken,
    );
    if (file.trashed || file.appProperties?.aleCategory !== 'planning-package') {
      throw new Error('Berkas yang dipilih bukan paket perencanaan terenkripsi yang aktif.');
    }
    files.push({ ...file, manifest: parseVaultDescription(file) });
    fileIds.add(fileId);
  }
  return files;
}

export async function bagikanBerkasDrive(accessToken, driveFileId, email) {
  if (typeof driveFileId !== 'string' || !/^[A-Za-z0-9_-]{1,256}$/.test(driveFileId) ||
      typeof email !== 'string' || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    throw new TypeError('Berkas atau alamat email penerima tidak valid.');
  }
  return requestGoogle(
    `${BASE_DRIVE}/files/${encodeURIComponent(driveFileId)}/permissions?sendNotificationEmail=false&fields=id,type,role,emailAddress`,
    accessToken,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ type: 'user', role: 'reader', emailAddress: email }),
    },
  );
}

export async function unggahLampiranChatDrive(accessToken, ownerId, identity, file, recipients) {
  if (!Array.isArray(recipients) || recipients.length < 1 ||
      recipients.length > 49 ||
      recipients.some((recipient) => !recipient || recipient.userId === ownerId ||
        typeof recipient.email !== 'string' ||
        !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(recipient.email))) {
    throw new TypeError('Penerima lampiran chat tidak valid.');
  }

  const saved = await unggahBerkasTerenkripsiDrive(
    accessToken,
    ownerId,
    identity,
    file,
    { category: 'communication', recipients: [identityAsRecipient(ownerId, identity), ...recipients] },
  );
  if (typeof saved.id !== 'string' || !saved.manifest) {
    throw new Error('Google Drive tidak mengembalikan metadata lampiran yang valid.');
  }

  const permissionIds = [];
  try {
    for (const recipient of recipients) {
      const permission = await bagikanBerkasDrive(accessToken, saved.id, recipient.email);
      if (typeof permission.id !== 'string') {
        throw new Error('Google Drive tidak mengembalikan ID izin berbagi.');
      }
      permissionIds.push(permission.id);
    }
  } catch (cause) {
    const cleanupErrors = [];
    for (const permissionId of permissionIds.reverse()) {
      try {
        await cabutBagikanBerkasDrive(accessToken, saved.id, permissionId);
      } catch (error) {
        cleanupErrors.push(error);
      }
    }
    try {
      await hapusLampiranChatDriveSetelahGagal(accessToken, saved.id, identity);
    } catch (error) {
      cleanupErrors.push(error);
    }
    if (cleanupErrors.length) {
      throw new AggregateError(
        [cause, ...cleanupErrors],
        'Lampiran gagal dibagikan dan pembersihan Drive tidak tuntas. Periksa izin Drive sebelum mencoba lagi.',
        { cause },
      );
    }
    throw cause;
  }

  return {
    driveFileId: saved.id,
    manifest: saved.manifest,
  };
}

function identityAsRecipient(userId, identity) {
  return {
    userId,
    publicKey: identity.publicKey,
    fingerprint: identity.fingerprint,
    keyVersion: identity.keyVersion,
  };
}

export async function hapusLampiranChatDriveSetelahGagal(accessToken, driveFileId, identity) {
  if (typeof driveFileId !== 'string' || !/^[A-Za-z0-9_-]{1,256}$/.test(driveFileId)) {
    throw new TypeError('ID lampiran Drive tidak valid.');
  }
  const metadata = await requestGoogle(
    `${BASE_DRIVE}/files/${encodeURIComponent(driveFileId)}?fields=id,description,appProperties,trashed`,
    accessToken,
  );
  const manifest = parseVaultDescription(metadata);
  const ownerEnvelope = manifest.keyEnvelopes.find(
    (envelope) => envelope.userId === identity?.userId &&
      envelope.recipientKeyFingerprint === identity?.fingerprint &&
      envelope.keyVersion === identity?.keyVersion,
  );
  if (metadata.trashed || metadata.appProperties?.aleCategory !== 'communication' ||
      !ownerEnvelope) {
    throw new Error('Lampiran Drive tidak cocok dengan identitas enkripsi pemilik.');
  }
  await requestGoogle(`${BASE_DRIVE}/files/${encodeURIComponent(driveFileId)}`, accessToken, {
    method: 'DELETE',
  });
}

export async function daftarIzinBerkasDrive(accessToken, driveFileId) {
  if (typeof driveFileId !== 'string' || !/^[A-Za-z0-9_-]{1,256}$/.test(driveFileId)) {
    throw new TypeError('ID berkas Drive tidak valid.');
  }
  const result = await requestGoogle(
    `${BASE_DRIVE}/files/${encodeURIComponent(driveFileId)}/permissions?pageSize=100&fields=permissions(id,type,role,emailAddress)`,
    accessToken,
  );
  if (!Array.isArray(result.permissions)) {
    throw new Error('Google Drive tidak mengembalikan daftar izin yang valid.');
  }
  return result.permissions;
}

export async function cabutBagikanBerkasDrive(accessToken, driveFileId, permissionId) {
  if (typeof driveFileId !== 'string' || !/^[A-Za-z0-9_-]{1,256}$/.test(driveFileId) ||
      typeof permissionId !== 'string' || !/^[A-Za-z0-9_-]{1,256}$/.test(permissionId)) {
    throw new TypeError('Berkas atau izin Drive tidak valid.');
  }
  await requestGoogle(
    `${BASE_DRIVE}/files/${encodeURIComponent(driveFileId)}/permissions/${encodeURIComponent(permissionId)}`,
    accessToken,
    { method: 'DELETE' },
  );
}

export async function hapusBerkasVaultDrive(accessToken, driveFileId, category, identity) {
  if (typeof driveFileId !== 'string' || !/^[A-Za-z0-9_-]{1,256}$/.test(driveFileId) ||
      category !== 'planning-package') {
    throw new TypeError('Berkas vault yang akan dihapus tidak valid.');
  }
  const metadata = await requestGoogle(
    `${BASE_DRIVE}/files/${encodeURIComponent(driveFileId)}?fields=id,description,appProperties,trashed`,
    accessToken,
  );
  const manifest = parseVaultDescription(metadata);
  const ownerEnvelope = manifest.keyEnvelopes.find(
    (envelope) => envelope.recipientKeyFingerprint === identity?.fingerprint &&
      envelope.keyVersion === identity?.keyVersion,
  );
  if (metadata.trashed || metadata.appProperties?.aleCategory !== category || !ownerEnvelope) {
    throw new Error('Berkas Drive tidak cocok dengan kategori atau kunci pemilik aktif.');
  }
  await requestGoogle(`${BASE_DRIVE}/files/${encodeURIComponent(driveFileId)}`, accessToken, {
    method: 'DELETE',
  });
}

async function bacaSatuBerkasTerenkripsiKategori(accessToken, identity, category, label) {
  const parameters = new URLSearchParams({
    q: [
      `appProperties has { key='aleKind' and value='${VAULT_KIND}' }`,
      `appProperties has { key='aleCategory' and value='${category}' }`,
      'trashed=false',
    ].join(' and '),
    pageSize: '10',
    fields: 'files(id,name,description,createdTime,size,appProperties),nextPageToken',
  });
  const result = await requestGoogle(`${BASE_DRIVE}/files?${parameters}`, accessToken);
  if (!Array.isArray(result.files) || result.nextPageToken || result.files.length > 1) {
    throw new Error(`${label} terenkripsi tidak unik atau daftar Drive tidak valid. Periksa salinan sebelum melanjutkan.`);
  }
  if (result.files.length === 0) return null;
  const file = result.files[0];
  if (file.appProperties?.aleCategory !== category) {
    throw new Error(`Kategori berkas ${label.toLowerCase()} terenkripsi tidak valid.`);
  }
  const manifest = parseVaultDescription(file);
  const content = await unduhBerkasTerenkripsiDrive(accessToken, { ...file, manifest }, identity);
  return { file, manifest, content };
}

export async function daftarJadwalTerenkripsiDrive(accessToken, identity) {
  const vault = await bacaSatuBerkasTerenkripsiKategori(
    accessToken,
    identity,
    'teacher-schedule',
    'Jadwal',
  );
  if (!vault) return null;
  const { file, manifest, content } = vault;
  try {
    let schedule;
    try {
      schedule = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(content.bytes));
    } catch (cause) {
      throw new Error('Jadwal terenkripsi tidak dapat dibaca.', { cause });
    }
    if (!schedule || typeof schedule !== 'object' || Array.isArray(schedule) ||
        Object.keys(schedule).sort().join(',') !== 'diperbarui,entri' ||
        !Array.isArray(schedule.entri) ||
        typeof schedule.diperbarui !== 'string' ||
        !Number.isFinite(Date.parse(schedule.diperbarui))) {
      throw new Error('Isi jadwal terenkripsi tidak valid.');
    }
    const normalized = normalisasiEntri(schedule.entri, bersihBawaan);
    if (normalized.dibuang > 0) {
      throw new Error('Jadwal terenkripsi berisi sesi tidak valid. Data tidak diubah.');
    }
    return {
      id: file.id,
      entries: normalized.entri,
      updatedAt: schedule.diperbarui,
      ciphertextSha256: manifest.ciphertextSha256,
    };
  } finally {
    content.bytes.fill(0);
  }
}

export async function daftarDenahTerenkripsiDrive(accessToken, identity) {
  const vault = await bacaSatuBerkasTerenkripsiKategori(
    accessToken,
    identity,
    'teacher-seating',
    'Denah',
  );
  if (!vault) return null;
  const { file, manifest, content } = vault;
  try {
    let seating;
    try {
      seating = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(content.bytes));
    } catch (cause) {
      throw new Error('Denah terenkripsi tidak dapat dibaca.', { cause });
    }
    if (!seating || typeof seating !== 'object' || Array.isArray(seating) ||
        Object.keys(seating).sort().join(',') !== 'denah,diperbarui' ||
        !Array.isArray(seating.denah) ||
        typeof seating.diperbarui !== 'string' ||
        !Number.isFinite(Date.parse(seating.diperbarui))) {
      throw new Error('Isi denah terenkripsi tidak valid.');
    }
    return {
      id: file.id,
      plans: seating.denah,
      updatedAt: seating.diperbarui,
      ciphertextSha256: manifest.ciphertextSha256,
    };
  } finally {
    content.bytes.fill(0);
  }
}

export async function hapusJadwalTerenkripsiDrive(accessToken, driveFileId, identity) {
  if (typeof driveFileId !== 'string' || !/^[A-Za-z0-9_-]{1,256}$/.test(driveFileId)) {
    throw new TypeError('ID jadwal Drive tidak valid.');
  }
  const metadata = await requestGoogle(
    `${BASE_DRIVE}/files/${encodeURIComponent(driveFileId)}?fields=id,description,appProperties,trashed`,
    accessToken,
  );
  const manifest = parseVaultDescription(metadata);
  if (metadata.trashed ||
      metadata.appProperties?.aleCategory !== 'teacher-schedule' ||
      manifest.keyEnvelope.recipientKeyFingerprint !== identity?.fingerprint ||
      manifest.keyEnvelope.keyVersion !== identity?.keyVersion) {
    throw new Error('Jadwal Drive tidak cocok dengan kunci pemilik aktif.');
  }
  await requestGoogle(`${BASE_DRIVE}/files/${encodeURIComponent(driveFileId)}`, accessToken, {
    method: 'DELETE',
  });
}

export async function hapusCatatanKerjaTerenkripsiDrive(accessToken, driveFileId, identity) {
  if (typeof driveFileId !== 'string' || !/^[A-Za-z0-9_-]{1,256}$/.test(driveFileId)) {
    throw new TypeError('ID catatan Drive tidak valid.');
  }
  const metadata = await requestGoogle(
    `${BASE_DRIVE}/files/${encodeURIComponent(driveFileId)}?fields=id,description,appProperties,trashed`,
    accessToken,
  );
  const manifest = parseVaultDescription(metadata);
  if (metadata.trashed ||
      metadata.appProperties?.aleCategory !== 'teacher-workspace' ||
      manifest.keyEnvelope.recipientKeyFingerprint !== identity?.fingerprint ||
      manifest.keyEnvelope.keyVersion !== identity?.keyVersion) {
    throw new Error('Catatan Drive tidak cocok dengan kunci pemilik aktif.');
  }
  await requestGoogle(`${BASE_DRIVE}/files/${encodeURIComponent(driveFileId)}`, accessToken, {
    method: 'DELETE',
  });
}

export async function unduhBerkasTerenkripsiDrive(
  accessToken,
  driveFile,
  identity,
  { maxCiphertextSize = BATAS_CIPHERTEXT, recipientId, signal } = {},
) {
  const manifest = driveFile?.manifest || parseVaultDescription(driveFile);
  const keyEnvelope = manifest.keyEnvelopes.find(
    (envelope) => (recipientId === undefined || envelope.userId === recipientId) &&
      envelope.recipientKeyFingerprint === identity?.fingerprint &&
      envelope.keyVersion === identity?.keyVersion,
  );
  if (driveFile.trashed ||
      typeof driveFile.id !== 'string' ||
      !/^[A-Za-z0-9_-]{1,256}$/.test(driveFile.id) ||
      !keyEnvelope) {
    throw new Error('Berkas ini tidak memiliki key-envelope untuk kunci aktif.');
  }
  if (!Number.isSafeInteger(maxCiphertextSize) ||
      manifest.ciphertextSizeBytes > maxCiphertextSize) {
    throw new Error('Berkas terenkripsi melebihi batas ukuran yang diizinkan.');
  }
  const ciphertext = await requestGoogleBytes(
    `${BASE_DRIVE}/files/${encodeURIComponent(driveFile.id)}?alt=media`,
    accessToken,
    maxCiphertextSize,
    signal,
  );
  if (ciphertext.length !== manifest.ciphertextSizeBytes) {
    ciphertext.fill(0);
    throw new Error('Ukuran ciphertext tidak cocok dengan metadata berkas.');
  }
  try {
    return await dekripsiBerkasDrive({
      version: manifest.version,
      iv: manifest.iv,
      ciphertextSha256: manifest.ciphertextSha256,
      ciphertextSizeBytes: manifest.ciphertextSizeBytes,
      ciphertext,
    }, keyEnvelope, identity);
  } finally {
    ciphertext.fill(0);
  }
}

export async function unduhLampiranChatDrive(
  accessToken,
  driveFileId,
  expected,
  identity,
  signal,
) {
  if (typeof driveFileId !== 'string' || !/^[A-Za-z0-9_-]{1,256}$/.test(driveFileId) ||
      !expected || !/^[a-f0-9]{64}$/.test(expected.ciphertextSha256 || '') ||
      !Number.isSafeInteger(expected.ciphertextSizeBytes) ||
      !Number.isSafeInteger(expected.fileSize) ||
      expected.fileSize < 1 || expected.fileSize > MAKS_BERKAS ||
      !['image', 'file'].includes(expected.type)) {
    throw new TypeError('Metadata lampiran chat tidak valid.');
  }

  const metadata = await requestGoogle(
    `${BASE_DRIVE}/files/${encodeURIComponent(driveFileId)}?fields=id,description,appProperties,trashed`,
    accessToken,
  );
  const manifest = parseVaultDescription(metadata);
  const envelope = manifest.keyEnvelopes.find(
    (candidate) => candidate.userId === identity?.userId,
  );
  if (metadata.trashed ||
      metadata.appProperties?.aleCategory !== 'communication' ||
      manifest.ciphertextSha256 !== expected.ciphertextSha256 ||
      manifest.ciphertextSizeBytes !== expected.ciphertextSizeBytes ||
      manifest.version !== expected.encryptionVersion ||
      !envelope ||
      envelope.wrappedDataKey !== expected.wrappedDataKey) {
    throw new Error('Lampiran Drive tidak cocok dengan metadata chat atau kunci penerima.');
  }

  const content = await unduhBerkasTerenkripsiDrive(
    accessToken,
    { ...metadata, manifest },
    identity,
    {
      maxCiphertextSize: MAKS_BERKAS + 8192,
      recipientId: identity.userId,
      signal,
    },
  );
  const allowedTypes = expected.type === 'image' ? TIPE_GAMBAR : TIPE_DOKUMEN;
  if (content.bytes.length !== expected.fileSize ||
      !allowedTypes.includes(content.mimeType) ||
      typeof content.name !== 'string' || !content.name.trim() ||
      content.name.length > 200) {
    content.bytes.fill(0);
    throw new Error('Isi lampiran tidak cocok dengan jenis atau ukuran pesan chat.');
  }
  return content;
}

export async function unggahKeDrive(accessToken, berkas) {
  if (!berkas || !(berkas instanceof File)) throw new Error('Pilih berkas yang akan diunggah.');
  if (berkas.size > BATAS_BERKAS) throw new Error('Ukuran berkas maksimal 10 MB.');
  const metadata = new Blob([JSON.stringify({ name: berkas.name })], {
    type: 'application/json; charset=UTF-8',
  });
  const form = new FormData();
  form.append('metadata', metadata);
  form.append('file', berkas);
  return requestGoogle(`${BASE_UPLOAD}/files?uploadType=multipart&fields=id,name,webViewLink`, accessToken, {
    method: 'POST',
    body: form,
  });
}

export async function simpanFotoProfilDiDrive(accessToken, uid, berkas) {
  if (!/^[A-Za-z0-9_-]{1,128}$/.test(uid)) throw new Error('Akun pengguna tidak valid.');
  if (!berkas || !(berkas instanceof File) || berkas.type !== 'image/jpeg') {
    throw new Error('Foto profil harus berupa JPEG.');
  }
  if (berkas.size === 0 || berkas.size > BATAS_BERKAS) {
    throw new Error('Ukuran salinan foto profil tidak valid.');
  }

  const metadata = {
    name: 'AI_nnoe-profile-photo.jpg',
    mimeType: 'image/jpeg',
    appProperties: { aleKind: 'profile-photo', aleUid: uid },
  };
  const query = encodeURIComponent(
    `appProperties has { key='aleKind' and value='profile-photo' } and appProperties has { key='aleUid' and value='${uid}' } and trashed=false`,
  );
  const daftar = await requestGoogle(
    `${BASE_DRIVE}/files?q=${query}&pageSize=1&fields=files(id)`,
    accessToken,
  );
  const form = new FormData();
  form.append('metadata', new Blob([JSON.stringify(metadata)], {
    type: 'application/json; charset=UTF-8',
  }));
  form.append('file', berkas);

  const idLama = daftar.files?.[0]?.id;
  const endpoint = idLama
    ? `${BASE_UPLOAD}/files/${encodeURIComponent(idLama)}?uploadType=multipart&fields=id,name,webViewLink`
    : `${BASE_UPLOAD}/files?uploadType=multipart&fields=id,name,webViewLink`;
  return requestGoogle(endpoint, accessToken, {
    method: idLama ? 'PATCH' : 'POST',
    body: form,
  });
}

export async function buatAcaraCalendar(accessToken, { judul, mulai, selesai, deskripsi = '' }) {
  const awal = new Date(mulai);
  const akhir = new Date(selesai);
  if (!judul.trim() || Number.isNaN(awal.getTime()) || Number.isNaN(akhir.getTime()) || akhir <= awal) {
    throw new Error('Isi judul acara dan pastikan waktu selesai setelah waktu mulai.');
  }
  return requestGoogle(`${BASE_CALENDAR}/calendars/primary/events`, accessToken, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      summary: judul.trim().slice(0, 120),
      description: deskripsi.trim().slice(0, 2000),
      start: { dateTime: awal.toISOString() },
      end: { dateTime: akhir.toISOString() },
    }),
  });
}

function base64Url(teks) {
  const bytes = new TextEncoder().encode(teks);
  let binary = '';
  for (let offset = 0; offset < bytes.length; offset += 0x8000) {
    binary += String.fromCharCode(...bytes.subarray(offset, offset + 0x8000));
  }
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
}

export async function kirimEmailUji(accessToken, email) {
  const alamat = String(email || '').trim();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(alamat)) {
    throw new Error('Alamat email akun tidak valid.');
  }
  const raw = [
    `To: ${alamat}`,
    'Subject: AI_nnoe - Uji koneksi Gmail',
    'MIME-Version: 1.0',
    'Content-Type: text/plain; charset=UTF-8',
    '',
    'Email uji koneksi Gmail AI_nnoe berhasil dikirim ke akun Anda sendiri.',
  ].join('\r\n');
  return requestGoogle(`${BASE_GMAIL}/users/me/messages/send`, accessToken, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ raw: base64Url(raw) }),
  });
}

export async function buatSpreadsheetDenganData(accessToken, { judul, values }) {
  const spreadsheetTitle = typeof judul === 'string' ? judul.trim() : '';
  if (!spreadsheetTitle || spreadsheetTitle.length > 120) {
    throw new TypeError('Judul spreadsheet harus diisi dan maksimal 120 karakter.');
  }
  if (!Array.isArray(values) || values.length === 0 || values.length > 500) {
    throw new TypeError('Data spreadsheet harus berisi 1 sampai 500 baris.');
  }
  if (!values.every((row) => Array.isArray(row) && row.length > 0 && row.length <= 20)) {
    throw new TypeError('Setiap baris spreadsheet harus berisi 1 sampai 20 kolom.');
  }
  const cellCount = values.reduce((total, row) => total + row.length, 0);
  if (cellCount > 5000 || values.some((row) => row.some((cell) => (
    typeof cell !== 'string' || cell.length > 2000
  )))) {
    throw new TypeError('Data spreadsheet melebihi batas 5.000 sel atau 2.000 karakter per sel.');
  }

  const spreadsheet = await requestGoogle(`${BASE_SHEETS}/spreadsheets`, accessToken, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      properties: { title: spreadsheetTitle },
      sheets: [{ properties: { title: 'Data' } }],
    }),
  });
  const sheet = spreadsheet.sheets?.[0]?.properties;
  if (typeof spreadsheet.spreadsheetId !== 'string' || !spreadsheet.spreadsheetId ||
      !Number.isInteger(sheet?.sheetId)) {
    throw new Error('Google Sheets tidak mengembalikan identitas spreadsheet yang valid.');
  }

  let spreadsheetUrl = spreadsheet.spreadsheetUrl ||
    `https://docs.google.com/spreadsheets/d/${encodeURIComponent(spreadsheet.spreadsheetId)}/edit`;
  try {
    const parsedUrl = new URL(spreadsheetUrl);
    if (parsedUrl.protocol !== 'https:' || parsedUrl.hostname !== 'docs.google.com') {
      throw new Error('Google Sheets mengembalikan alamat spreadsheet yang tidak aman.');
    }
    spreadsheetUrl = parsedUrl.href;
  } catch (error) {
    if (error.message === 'Google Sheets mengembalikan alamat spreadsheet yang tidak aman.') {
      throw error;
    }
    throw new Error('Google Sheets mengembalikan alamat spreadsheet yang tidak valid.', { cause: error });
  }

  try {
    await requestGoogle(
      `${BASE_SHEETS}/spreadsheets/${encodeURIComponent(spreadsheet.spreadsheetId)}/values/Data!A1?valueInputOption=RAW`,
      accessToken,
      {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ majorDimension: 'ROWS', values }),
      },
    );
  } catch (error) {
    throw new Error(
      'Spreadsheet kosong sudah dibuat, tetapi data gagal ditulis. Periksa Google Sheets sebelum mencoba ulang.',
      { cause: error },
    );
  }
  return {
    spreadsheetId: spreadsheet.spreadsheetId,
    spreadsheetUrl,
  };
}
