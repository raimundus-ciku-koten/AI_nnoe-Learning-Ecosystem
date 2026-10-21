'use strict';

const ROLES = Object.freeze(['admin_sekolah', 'operator', 'guru', 'siswa', 'ortu']);

function normalisasiNama(nama) {
  return String(nama || '')
    .trim()
    .replace(/\s+/g, ' ')
    .replace(/(^|[\s-])(\p{L})/gu, (_, pemisah, huruf) => (
      `${pemisah}${huruf.toLocaleUpperCase('id-ID')}`
    ));
}

class PlatformUserError extends Error {
  constructor(code, message) {
    super(message);
    this.name = 'PlatformUserError';
    this.code = code;
  }
}

function parseCreateUserRequest(data) {
  const fields = ['email', 'nama', 'role', 'tenantId'];
  if (!data || typeof data !== 'object' || Array.isArray(data) ||
      Object.keys(data).sort().join(',') !== [...fields].sort().join(',')) {
    throw new PlatformUserError('invalid-argument', 'Data akun tidak lengkap atau memuat kolom yang tidak diizinkan.');
  }

  const nama = typeof data.nama === 'string' ? normalisasiNama(data.nama) : '';
  const email = typeof data.email === 'string' ? data.email.trim().toLowerCase() : '';
  const role = data.role;
  const tenantId = typeof data.tenantId === 'string' ? data.tenantId.trim() : '';

  if (nama.length < 2 || nama.length > 120 || /[\u0000-\u001f\u007f]/.test(nama)) {
    throw new PlatformUserError('invalid-argument', 'Nama harus berisi 2–120 karakter.');
  }
  if (email.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    throw new PlatformUserError('invalid-argument', 'Alamat email tidak valid.');
  }
  if (!ROLES.includes(role)) {
    throw new PlatformUserError('invalid-argument', 'Peran akun tidak didukung.');
  }
  if (!/^[A-Za-z0-9_-]{1,128}$/.test(tenantId)) {
    throw new PlatformUserError('invalid-argument', 'ID tenant sekolah tidak valid.');
  }

  return { nama, email, role, tenantId };
}

function createPlatformUserService({ auth, db, fieldValue, randomUUID, onCleanupError = () => {} }) {
  if (!auth || !db || !fieldValue || typeof randomUUID !== 'function') {
    throw new TypeError('Firebase Auth, Firestore, FieldValue, dan randomUUID wajib tersedia.');
  }

  async function create(actorUid, data) {
    if (typeof actorUid !== 'string' || !actorUid.trim()) {
      throw new PlatformUserError('unauthenticated', 'Sesi superadmin tidak valid.');
    }

    const request = parseCreateUserRequest(data);
    const tenant = await db.doc(`tenants/${request.tenantId}`).get();
    if (!tenant.exists) {
      throw new PlatformUserError('not-found', 'Tenant sekolah tidak ditemukan.');
    }

    let user;
    try {
      user = await auth.createUser({
        email: request.email,
        displayName: request.nama,
        emailVerified: false,
        disabled: false,
      });
    } catch (error) {
      if (error?.code === 'auth/email-already-exists') {
        throw new PlatformUserError('already-exists', 'Email tersebut sudah digunakan oleh akun Firebase.');
      }
      throw error;
    }

    try {
      await auth.setCustomUserClaims(user.uid, {
        role: request.role,
        tenantId: request.tenantId,
      });
      const batch = db.batch();
      batch.set(db.doc(`users/${user.uid}`), {
        nama: request.nama,
        email: request.email,
        role: request.role,
        tenantId: request.tenantId,
        aktif: true,
        dibuat: fieldValue.serverTimestamp(),
      });
      batch.set(db.doc(`directory/${user.uid}`), {
        uid: user.uid,
        nama: request.nama,
        role: request.role,
        tenantId: request.tenantId,
        updatedAt: fieldValue.serverTimestamp(),
      });
      batch.create(db.doc(`platformAudit/${randomUUID()}`), {
        actorUid,
        action: 'platform.user.created',
        target: user.uid,
        role: request.role,
        tenantId: request.tenantId,
        createdAt: fieldValue.serverTimestamp(),
      });
      await batch.commit();
    } catch (error) {
      try {
        await auth.updateUser(user.uid, { disabled: true });
      } catch (cleanupError) {
        onCleanupError(cleanupError, user.uid);
      }
      try {
        await auth.setCustomUserClaims(user.uid, {});
      } catch (cleanupError) {
        onCleanupError(cleanupError, user.uid);
      }
      try {
        await auth.deleteUser(user.uid);
      } catch (cleanupError) {
        onCleanupError(cleanupError, user.uid);
      }
      throw error;
    }

    return {
      uid: user.uid,
      email: request.email,
      role: request.role,
      tenantId: request.tenantId,
    };
  }

  return { create };
}

module.exports = {
  ROLES,
  PlatformUserError,
  normalisasiNama,
  parseCreateUserRequest,
  createPlatformUserService,
};
