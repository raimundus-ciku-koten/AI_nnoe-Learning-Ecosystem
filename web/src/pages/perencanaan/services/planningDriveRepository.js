import { getState } from '../../../state.js';
import { identitasEnkripsiDriveDalamSesi } from '../../../services/driveEncryption.js';
import { ambilKunciPublikPengguna } from '../../../services/encryptionKeyDirectory.js';
import {
  bagikanBerkasDrive,
  bukaPemilihPaketDrive,
  cabutBagikanBerkasDrive,
  daftarIzinBerkasDrive,
  daftarPaketPerencanaanTerenkripsiDrive,
  hapusBerkasVaultDrive,
  unggahBerkasTerenkripsiDrive,
  unduhBerkasTerenkripsiDrive,
} from '../../../services/googleWorkspace.js';
import { sesiGoogleWorkspacePerPengguna } from '../../../services/googleWorkspaceAuth.js';
import { BATAS, JENIS, SCHEMA_VERSION } from '../constants.js';

const WATCH_INTERVAL_MS = 30000;
const MAX_SHARED_PACKAGES = 200;
const DOC_TYPES = new Set(Object.values(JENIS).filter((jenis) => jenis !== JENIS.MODUL));
const selectedPackagesByUser = new Map();

export class KonflikVersiError extends Error {
  constructor(pesan = 'Data diubah di tempat lain.') {
    super(pesan);
    this.name = 'KonflikVersiError';
    this.kode = 'KONFLIK_VERSI';
  }
}

export class BatasPaketError extends Error {
  constructor() {
    super('Batas jumlah paket tercapai.');
    this.name = 'BatasPaketError';
    this.kode = 'BATAS_PAKET';
  }
}

function plainObject(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function sessionForCurrentUser() {
  const state = getState();
  const userId = state.user?.uid;
  const tenantId = state.tenantId;
  if (!userId || !tenantId) throw new Error('Sesi pengguna dan sekolah tidak tersedia.');
  const session = sesiGoogleWorkspacePerPengguna(userId);
  const identity = identitasEnkripsiDriveDalamSesi(userId);
  if (!session || !identity) {
    throw new Error('Hubungkan Google Drive dan buka kunci vault untuk mengakses Perencanaan.');
  }
  return { userId, tenantId, role: state.role, token: session.accessToken, identity };
}

function validBundle(bundle, file) {
  if (!plainObject(bundle) ||
      Object.keys(bundle).sort().join(',') !==
        'createdAt,documents,grants,id,konteks,modules,ownerUid,rev,schemaVersion,tenantId,updatedAt' ||
      bundle.schemaVersion !== SCHEMA_VERSION ||
      bundle.id !== file.appProperties?.aleRecord ||
      typeof bundle.ownerUid !== 'string' ||
      typeof bundle.tenantId !== 'string' ||
      !bundle.tenantId ||
      !Number.isInteger(bundle.rev) || bundle.rev < 1 ||
      !plainObject(bundle.konteks) ||
      !plainObject(bundle.documents) ||
      !plainObject(bundle.modules) ||
      !Array.isArray(bundle.grants) ||
      bundle.grants.length > 20 ||
      typeof bundle.createdAt !== 'string' ||
      typeof bundle.updatedAt !== 'string' ||
      !Number.isFinite(Date.parse(bundle.createdAt)) ||
      !Number.isFinite(Date.parse(bundle.updatedAt)) ||
      Date.parse(bundle.createdAt) > Date.parse(bundle.updatedAt)) {
    throw new Error('Struktur paket perencanaan terenkripsi tidak valid.');
  }
  const grantees = new Set();
  for (const grant of bundle.grants) {
    if (!plainObject(grant) ||
        typeof grant.userId !== 'string' ||
        !grant.userId ||
        typeof grant.email !== 'string' ||
        !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(grant.email) ||
        !/^[a-f0-9]{64}$/.test(grant.fingerprint || '') ||
        !Number.isInteger(grant.keyVersion) || grant.keyVersion < 1 ||
        grantees.has(grant.userId) || grant.userId === bundle.ownerUid) {
      throw new Error('Daftar izin paket terenkripsi tidak valid.');
    }
    grantees.add(grant.userId);
  }
  for (const [jenis, document] of Object.entries(bundle.documents)) {
    if (!DOC_TYPES.has(jenis) || !plainObject(document) ||
        document.jenis !== jenis || !Number.isInteger(document.rev) || document.rev < 1 ||
        !plainObject(document.payload) ||
        !['mesin', 'ai', 'manual'].includes(document.sumber) ||
        !plainObject(document.sumberRev)) {
      throw new Error('Dokumen perencanaan terenkripsi tidak valid.');
    }
  }
  for (const [unit, document] of Object.entries(bundle.modules)) {
    if (!/^[1-9]\d?$/.test(unit) || Number(unit) > 30 ||
        !plainObject(document) || document.jenis !== JENIS.MODUL ||
        !Number.isInteger(document.rev) || document.rev < 1 ||
        !plainObject(document.payload) ||
        !['mesin', 'ai', 'manual'].includes(document.sumber) ||
        !plainObject(document.sumberRev)) {
      throw new Error('Modul perencanaan terenkripsi tidak valid.');
    }
  }
  return bundle;
}

function toPackage(bundle, file) {
  return {
    ...bundle.konteks,
    id: bundle.id,
    ownerUid: bundle.ownerUid,
    tenantId: bundle.tenantId,
    rev: bundle.rev,
    dibuatPada: Date.parse(bundle.createdAt),
    diubahPada: Date.parse(bundle.updatedAt),
    ciphertextSha256: file.manifest.ciphertextSha256,
    driveFileId: file.id,
    grants: bundle.grants,
  };
}

async function decodeFile(token, identity, file, tenantId) {
  const hasEnvelope = file.manifest.keyEnvelopes.some(
    (envelope) => envelope.recipientKeyFingerprint === identity.fingerprint &&
      envelope.keyVersion === identity.keyVersion,
  );
  if (!hasEnvelope) return null;
  const content = await unduhBerkasTerenkripsiDrive(token, file, identity);
  try {
    let bundle;
    try {
      bundle = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(content.bytes));
    } catch (cause) {
      throw new Error('Isi paket perencanaan terenkripsi tidak dapat dibaca.', { cause });
    }
    validBundle(bundle, file);
    if (bundle.tenantId !== tenantId) {
      throw new Error('Tenant pada paket perencanaan tidak sesuai dengan sesi aktif.');
    }
    return { bundle, file, package: toPackage(bundle, file) };
  } finally {
    content.bytes.fill(0);
  }
}

async function loadAllPackages({ userId, tenantId, role, token, identity }) {
  const selectedFileIds = selectedPackagesByUser.get(userId) ?? [];
  let files;
  try {
    files = await daftarPaketPerencanaanTerenkripsiDrive(token, selectedFileIds, {
      includeCreatedFiles: role !== 'admin_sekolah',
    });
  } catch (error) {
    if (selectedFileIds.length && [403, 404].includes(error?.status)) {
      selectedPackagesByUser.delete(userId);
      throw new Error('Akses paket Drive berubah atau dicabut. Pilih kembali paket yang masih dibagikan.');
    }
    throw error;
  }
  if (files.length > MAX_SHARED_PACKAGES) {
    throw new Error('Jumlah paket yang dapat diakses melebihi batas aman.');
  }
  const decoded = [];
  for (let offset = 0; offset < files.length; offset += 4) {
    const batch = await Promise.all(files.slice(offset, offset + 4).map(
      (file) => decodeFile(token, identity, file, tenantId),
    ));
    decoded.push(...batch.filter(Boolean));
  }
  return decoded.filter(({ bundle }) => (
    bundle.ownerUid === userId ||
    bundle.grants.some((grant) => grant.userId === userId)
  ));
}

function makeWatcher(userId, tenantId) {
  const context = sessionForCurrentUser();
  if (context.userId !== userId || context.tenantId !== tenantId) {
    throw new Error('Sesi Perencanaan tidak cocok dengan pengguna atau tenant yang diminta.');
  }
  const watcher = {
    userId,
    tenantId,
    listeners: new Set(),
    packages: [],
    timer: null,
    loading: false,
    refreshRequested: false,
    stopped: false,
    async refresh() {
      if (watcher.stopped) return;
      if (watcher.loading) {
        watcher.refreshRequested = true;
        return;
      }
      watcher.loading = true;
      try {
        watcher.packages = await loadAllPackages(context);
        for (const listener of watcher.listeners) listener.onData(watcher.packages);
      } catch (error) {
        for (const listener of watcher.listeners) listener.onError(error);
      } finally {
        watcher.loading = false;
        if (watcher.refreshRequested && !watcher.stopped && watcher.listeners.size) {
          watcher.refreshRequested = false;
          queueMicrotask(watcher.refresh);
        } else if (!watcher.stopped && watcher.listeners.size) {
          watcher.timer = setTimeout(watcher.refresh, WATCH_INTERVAL_MS);
        }
      }
    },
    add(listener) {
      watcher.listeners.add(listener);
      if (watcher.packages.length) listener.onData(watcher.packages);
      if (!watcher.loading && !watcher.timer) watcher.refresh();
      return () => {
        watcher.listeners.delete(listener);
        if (!watcher.listeners.size) {
          watcher.stopped = true;
          clearTimeout(watcher.timer);
          watcher.timer = null;
          watchers.delete(`${userId}:${tenantId}`);
        }
      };
    },
  };
  return watcher;
}

const watchers = new Map();

function subscribe(userId, tenantId, listener) {
  const key = `${userId}:${tenantId}`;
  let watcher = watchers.get(key);
  if (!watcher) {
    watcher = makeWatcher(userId, tenantId);
    watchers.set(key, watcher);
  }
  return watcher.add(listener);
}

function notifyWatchers(userId, tenantId) {
  const watcher = watchers.get(`${userId}:${tenantId}`);
  if (watcher) {
    clearTimeout(watcher.timer);
    watcher.timer = null;
    watcher.refresh();
  }
}

function assertOwner(bundle, requesterId) {
  if (bundle.ownerUid !== requesterId) {
    throw new Error('Hanya pemilik paket yang dapat mengubah atau menghapus perencanaan.');
  }
}

async function recipientsFor(bundle, identity) {
  const recipients = [{
    userId: bundle.ownerUid,
    publicKey: identity.publicKey,
    fingerprint: identity.fingerprint,
    keyVersion: identity.keyVersion,
  }];
  for (const grant of bundle.grants) {
    const key = await ambilKunciPublikPengguna(grant.userId, bundle.tenantId);
    if (key.fingerprint !== grant.fingerprint || key.keyVersion !== grant.keyVersion ||
        key.email.toLowerCase() !== grant.email.toLowerCase()) {
      throw new Error(`Kunci atau identitas admin ${grant.email} berubah. Cabut lalu berikan izin kembali.`);
    }
    recipients.push({
      userId: key.userId,
      publicKey: key.publicKey,
      fingerprint: key.fingerprint,
      keyVersion: key.keyVersion,
    });
  }
  return recipients;
}

async function persistPackage(context, decoded, bundle, { bumpPackageRevision = false } = {}) {
  const { userId, tenantId, token, identity } = context;
  assertOwner(bundle, userId);
  if (bumpPackageRevision) bundle.rev += 1;
  bundle.updatedAt = new Date().toISOString();
  validBundle(bundle, decoded.file);
  const file = new File([JSON.stringify(bundle)], 'planning-package.json', {
    type: 'application/json',
    lastModified: Date.now(),
  });
  await unggahBerkasTerenkripsiDrive(token, userId, identity, file, {
    category: 'planning-package',
    fileId: decoded.file?.id ?? null,
    expectedCiphertextSha256: decoded.file?.manifest.ciphertextSha256 ?? '',
    recipients: await recipientsFor(bundle, identity),
    recordId: bundle.id,
  });
  notifyWatchers(userId, tenantId);
}

async function getPackage(context, ownerUid, packageId) {
  const records = await loadAllPackages(context);
  const decoded = records.find(({ bundle }) =>
    bundle.ownerUid === ownerUid && bundle.id === packageId);
  if (!decoded) throw new Error('Paket tidak ditemukan atau belum dibagikan kepada akun ini.');
  return decoded;
}

export async function bacaInputAi({ uid, paketId, jenis, noUnit }) {
  if (!['atp', 'kktp', 'modul'].includes(jenis)) {
    throw new TypeError('Jenis dokumen AI perencanaan tidak valid.');
  }
  const context = sessionForCurrentUser();
  if (context.userId !== uid) throw new Error('AI hanya dapat membaca paket milik akun yang sedang masuk.');
  const { bundle } = await getPackage(context, uid, paketId);
  assertOwner(bundle, context.userId);
  const limits = { mapel: 120, kelas: 30, fase: 4, tahunAjaran: 9 };
  for (const [field, maximum] of Object.entries(limits)) {
    const value = bundle.konteks[field];
    if (typeof value !== 'string' || !value.trim() || value.length > maximum) {
      throw new Error(`Konteks paket ${field} tidak valid untuk generator AI.`);
    }
  }
  const input = {
    mapel: bundle.konteks.mapel,
    kelas: bundle.konteks.kelas,
    fase: bundle.konteks.fase,
    tahunAjaran: bundle.konteks.tahunAjaran,
  };
  if (jenis === 'atp') {
    const rpe = bundle.documents[JENIS.RPE]?.payload;
    if (!plainObject(rpe) || !Number.isInteger(rpe.totalJP) || !Number.isInteger(rpe.jpPerPekan)) {
      throw new Error('Simpan RPE yang valid sebelum membuat ATP.');
    }
    return { ...input, totalJP: rpe.totalJP, jpPerPekan: rpe.jpPerPekan };
  }

  const atp = bundle.documents[JENIS.ATP]?.payload;
  if (!plainObject(atp) || !Array.isArray(atp.unit) || !atp.unit.length) {
    throw new Error('Simpan ATP yang valid sebelum membuat dokumen turunannya.');
  }
  if (atp.unit.some((unit) => !plainObject(unit) || !Number.isInteger(unit.no) ||
      typeof unit.nama !== 'string' || !Array.isArray(unit.tp))) {
    throw new Error('Struktur unit ATP tidak valid untuk generator AI.');
  }
  const tpByUnit = atp.unit.map((unit) => ({
    no: unit.no,
    nama: unit.nama,
    semester: unit.semester,
    tp: Array.isArray(unit.tp) ? unit.tp.map((tp) => {
      if (typeof tp?.kode !== 'string' || typeof tp?.rumusan !== 'string' ||
          typeof tp?.materi !== 'string') {
        throw new Error('Struktur tujuan pembelajaran ATP tidak valid untuk generator AI.');
      }
      return { kode: tp.kode, rumusan: tp.rumusan, materi: tp.materi };
    }) : [],
  }));
  const kodeTp = tpByUnit.flatMap((unit) => unit.tp.map((tp) =>
    String(tp.kode).toUpperCase().replace(/[^A-Z0-9]/g, '')));
  if (!kodeTp.length || kodeTp.length > 80 || new Set(kodeTp).size !== kodeTp.length) {
    throw new Error('Struktur atau kode tujuan pembelajaran ATP tidak valid untuk generator AI.');
  }
  if (jenis === 'kktp') return { ...input, unit: tpByUnit, kodeTp };

  const unit = tpByUnit.find((item) => item.no === Number(noUnit));
  if (!unit || !unit.tp.length) throw new Error('Unit ATP yang dipilih tidak memiliki tujuan pembelajaran.');
  return { ...input, unit, kodeTp: unit.tp.map((tp) =>
    String(tp.kode).toUpperCase().replace(/[^A-Z0-9]/g, '')) };
}

export async function buatPaket({ uid, tenantId, konteks, jumlahPaketSaatIni = 0 }) {
  const context = sessionForCurrentUser();
  if (context.userId !== uid || context.tenantId !== tenantId) {
    throw new Error('Sesi pengguna tidak cocok dengan paket yang akan dibuat.');
  }
  if (jumlahPaketSaatIni >= BATAS.PAKET_MAKS_PER_GURU) throw new BatasPaketError();
  const now = new Date().toISOString();
  const bundle = {
    schemaVersion: SCHEMA_VERSION,
    id: globalThis.crypto.randomUUID(),
    ownerUid: uid,
    tenantId,
    rev: 1,
    konteks,
    grants: [],
    documents: {},
    modules: {},
    createdAt: now,
    updatedAt: now,
  };
  const file = new File([JSON.stringify(bundle)], 'planning-package.json', {
    type: 'application/json',
    lastModified: Date.now(),
  });
  await unggahBerkasTerenkripsiDrive(context.token, uid, context.identity, file, {
    category: 'planning-package',
    recordId: bundle.id,
  });
  notifyWatchers(uid, tenantId);
  return bundle.id;
}

export async function perbaruiPaket({ uid, paketId, konteks, revDasar }) {
  const context = sessionForCurrentUser();
  const decoded = await getPackage(context, uid, paketId);
  assertOwner(decoded.bundle, context.userId);
  if (decoded.bundle.rev !== revDasar) throw new KonflikVersiError();
  decoded.bundle.konteks = konteks;
  await persistPackage(context, decoded, decoded.bundle, { bumpPackageRevision: true });
}

export function dengarDaftarPaket(uid, tenantId, onData, onError) {
  return subscribe(getState().user?.uid, tenantId, {
    onData: (records) => onData(records
      .filter(({ bundle }) => bundle.ownerUid === uid)
      .map(({ package: item }) => item)
      .sort((a, b) => b.diubahPada - a.diubahPada)),
    onError,
  });
}

export async function pilihPaketAdminDrive(ownerUid) {
  const context = sessionForCurrentUser();
  if (getState().role !== 'admin_sekolah') {
    throw new Error('Hanya admin sekolah yang dapat memilih paket guru yang dibagikan.');
  }
  if (typeof ownerUid !== 'string' || !ownerUid) {
    throw new TypeError('Guru pemilik paket tidak valid.');
  }
  const ids = await bukaPemilihPaketDrive(context.token);
  if (!ids.length) return 0;
  const files = await daftarPaketPerencanaanTerenkripsiDrive(context.token, ids, {
    includeCreatedFiles: false,
  });
  const records = [];
  for (const file of files.filter((item) => ids.includes(item.id))) {
    const decoded = await decodeFile(context.token, context.identity, file, context.tenantId);
    if (!decoded || decoded.bundle.ownerUid !== ownerUid ||
        !decoded.bundle.grants.some((grant) => grant.userId === context.userId)) {
      throw new Error('Pilih hanya paket guru ini yang dibagikan secara eksplisit kepada akun admin Anda.');
    }
    records.push(decoded);
  }
  if (records.length !== ids.length) {
    throw new Error('Google Drive tidak mengembalikan semua paket yang dipilih.');
  }
  const selectedFileIds = [
    ...new Set([...(selectedPackagesByUser.get(context.userId) ?? []), ...ids]),
  ];
  if (selectedFileIds.length > MAX_SHARED_PACKAGES) {
    throw new Error('Jumlah paket yang dipilih melebihi batas aman.');
  }
  selectedPackagesByUser.set(context.userId, selectedFileIds);
  notifyWatchers(context.userId, context.tenantId);
  return records.length;
}

export async function daftarArsipPerencanaan(uid) {
  const context = sessionForCurrentUser();
  if (context.userId !== uid) throw new Error('Arsip hanya tersedia bagi akun pemilik yang sedang masuk.');
  const records = await loadAllPackages(context);
  const docs = [];
  for (const { bundle, package: item } of records) {
    if (bundle.ownerUid !== uid) continue;
    for (const document of Object.values(bundle.documents)) {
      docs.push({
        ...document,
        paketId: bundle.id,
        mapel: item.mapel,
        kelas: item.kelas,
        fase: item.fase,
        tahunAjaran: item.tahunAjaran,
        diubahPada: Date.parse(document.updatedAt || bundle.updatedAt),
        dibuatPada: Date.parse(document.createdAt || bundle.createdAt),
      });
    }
    for (const document of Object.values(bundle.modules)) {
      docs.push({
        ...document,
        jenis: JENIS.MODUL,
        noUnit: Number(document.noUnit),
        paketId: bundle.id,
        mapel: item.mapel,
        kelas: item.kelas,
        fase: item.fase,
        tahunAjaran: item.tahunAjaran,
        diubahPada: Date.parse(document.updatedAt || bundle.updatedAt),
        dibuatPada: Date.parse(document.createdAt || bundle.createdAt),
      });
    }
  }
  return docs.sort((a, b) => (b.diubahPada ?? b.dibuatPada ?? 0) -
    (a.diubahPada ?? a.dibuatPada ?? 0));
}

export function dengarPaket(uid, paketId, onData, onError) {
  return subscribe(getState().user?.uid, getState().tenantId, {
    onData: (records) => onData(records.find(({ bundle }) =>
      bundle.ownerUid === uid && bundle.id === paketId)?.package ?? null),
    onError,
  });
}

export async function hapusPaket(uid, tenantId, paketId) {
  const context = sessionForCurrentUser();
  if (context.userId !== uid || context.tenantId !== tenantId) {
    throw new Error('Hanya pemilik paket pada tenant aktif yang dapat menghapus paket.');
  }
  const decoded = await getPackage(context, uid, paketId);
  assertOwner(decoded.bundle, context.userId);
  await hapusBerkasVaultDrive(context.token, decoded.file.id, 'planning-package', context.identity);
  notifyWatchers(uid, tenantId);
}

export function dengarDokumen(uid, tenantId, paketId, onData, onError) {
  return subscribe(getState().user?.uid, tenantId, {
    onData: (records) => {
      const bundle = records.find(({ bundle: value }) =>
        value.ownerUid === uid && value.id === paketId)?.bundle;
      onData(bundle ? bundle.documents : {});
    },
    onError,
  });
}

export async function simpanDokumen({
  uid, tenantId, paketId, jenis, payload, sumber, sumberRev, revDasar = 0,
}) {
  if (!DOC_TYPES.has(jenis) || !plainObject(payload) ||
      !['mesin', 'ai', 'manual'].includes(sumber) || !plainObject(sumberRev)) {
    throw new TypeError('Dokumen perencanaan tidak valid.');
  }
  const context = sessionForCurrentUser();
  const decoded = await getPackage(context, uid, paketId);
  assertOwner(decoded.bundle, context.userId);
  if (decoded.bundle.tenantId !== tenantId) throw new Error('Tenant paket tidak sesuai.');
  const old = decoded.bundle.documents[jenis];
  const oldRevision = old?.rev ?? 0;
  if (oldRevision !== revDasar) throw new KonflikVersiError();
  const now = new Date().toISOString();
  decoded.bundle.documents[jenis] = {
    ownerUid: uid,
    tenantId,
    paketId,
    jenis,
    schemaVersion: SCHEMA_VERSION,
    rev: oldRevision + 1,
    sumber,
    sumberRev,
    payload,
    ...(old?.createdAt ? { createdAt: old.createdAt } : { createdAt: now }),
    updatedAt: now,
  };
  await persistPackage(context, decoded, decoded.bundle);
  return oldRevision + 1;
}

export function dengarModul(uid, tenantId, paketId, onData, onError) {
  return subscribe(getState().user?.uid, tenantId, {
    onData: (records) => {
      const bundle = records.find(({ bundle: value }) =>
        value.ownerUid === uid && value.id === paketId)?.bundle;
      onData(bundle ? bundle.modules : {});
    },
    onError,
  });
}

export async function simpanModul({
  uid, tenantId, paketId, noUnit, payload, sumber, sumberRev, revDasar = 0,
}) {
  if (!Number.isInteger(Number(noUnit)) || Number(noUnit) < 1 || Number(noUnit) > 30 ||
      !plainObject(payload) || !['mesin', 'ai', 'manual'].includes(sumber) ||
      !plainObject(sumberRev)) {
    throw new TypeError('Modul perencanaan tidak valid.');
  }
  const context = sessionForCurrentUser();
  const decoded = await getPackage(context, uid, paketId);
  assertOwner(decoded.bundle, context.userId);
  if (decoded.bundle.tenantId !== tenantId) throw new Error('Tenant paket tidak sesuai.');
  const key = String(Number(noUnit));
  const old = decoded.bundle.modules[key];
  const oldRevision = old?.rev ?? 0;
  if (oldRevision !== revDasar) throw new KonflikVersiError();
  const now = new Date().toISOString();
  decoded.bundle.modules[key] = {
    ownerUid: uid,
    tenantId,
    paketId,
    jenis: JENIS.MODUL,
    noUnit: Number(noUnit),
    schemaVersion: SCHEMA_VERSION,
    rev: oldRevision + 1,
    sumber,
    sumberRev,
    payload,
    ...(old?.createdAt ? { createdAt: old.createdAt } : { createdAt: now }),
    updatedAt: now,
  };
  await persistPackage(context, decoded, decoded.bundle);
  return oldRevision + 1;
}

export async function berikanAksesPaket({ uid, tenantId, paketId, adminId }) {
  const context = sessionForCurrentUser();
  if (context.userId !== uid || context.tenantId !== tenantId) {
    throw new Error('Hanya pemilik paket pada tenant aktif yang dapat memberikan akses.');
  }
  const decoded = await getPackage(context, uid, paketId);
  assertOwner(decoded.bundle, context.userId);
  const recipient = await ambilKunciPublikPengguna(adminId, tenantId);
  if (decoded.bundle.grants.some((grant) => grant.userId === adminId)) return;
  if (decoded.bundle.grants.length >= 20) throw new Error('Batas penerima akses paket tercapai.');

  const permissions = await daftarIzinBerkasDrive(context.token, decoded.file.id);
  let permission = permissions.find((item) =>
    item.type === 'user' && item.emailAddress?.toLowerCase() === recipient.email.toLowerCase());
  let permissionCreated = false;
  if (permission && permission.role !== 'reader') {
    throw new Error('Admin sudah memiliki izin Drive dengan hak yang lebih luas. Ubah izin tersebut sebelum berbagi paket.');
  }
  if (!permission) {
    permission = await bagikanBerkasDrive(context.token, decoded.file.id, recipient.email);
    permissionCreated = true;
  }
  decoded.bundle.grants.push({
    userId: recipient.userId,
    email: recipient.email,
    fingerprint: recipient.fingerprint,
    keyVersion: recipient.keyVersion,
  });
  try {
    await persistPackage(context, decoded, decoded.bundle);
  } catch (error) {
    if (permissionCreated && permission?.id) {
      try {
        await cabutBagikanBerkasDrive(context.token, decoded.file.id, permission.id);
      } catch (cleanupError) {
        throw new AggregateError([error, cleanupError],
          'Pemberian akses paket gagal dan izin Drive sementara tidak dapat dicabut.');
      }
    }
    throw error;
  }
}

export async function cabutAksesPaket({ uid, tenantId, paketId, adminId }) {
  const context = sessionForCurrentUser();
  if (context.userId !== uid || context.tenantId !== tenantId) {
    throw new Error('Hanya pemilik paket pada tenant aktif yang dapat mencabut akses.');
  }
  const decoded = await getPackage(context, uid, paketId);
  assertOwner(decoded.bundle, context.userId);
  const grant = decoded.bundle.grants.find((item) => item.userId === adminId);
  if (!grant) return;
  decoded.bundle.grants = decoded.bundle.grants.filter((item) => item.userId !== adminId);
  await persistPackage(context, decoded, decoded.bundle);

  const permissions = await daftarIzinBerkasDrive(context.token, decoded.file.id);
  const recipientPermissions = permissions.filter((item) =>
    item.type === 'user' && item.emailAddress?.toLowerCase() === grant.email.toLowerCase());
  for (const permission of recipientPermissions) {
    if (permission.role !== 'reader') {
      throw new Error('Key-envelope sudah dicabut, tetapi izin Drive memiliki hak lebih luas dan harus diperbaiki manual.');
    }
    await cabutBagikanBerkasDrive(context.token, decoded.file.id, permission.id);
  }
}
