/**
 * Arsip handler Firebase; entry point sengaja dinonaktifkan.
 */

throw new Error('Legacy Firebase chat functions diarsipkan dan dinonaktifkan.');

const { onValueCreated } = require('firebase-functions/v2/database');
const { onCall, HttpsError } = require('firebase-functions/v2/https');
const admin = require('firebase-admin');
const { getFirestore } = require('firebase-admin/firestore');
const {
  buatPayloadNotifikasi,
  bacaTokenPerangkat,
  kelompokkanToken,
} = require('./lib/chatNotifications');

// ========== Notifikasi push saat pesan baru ==========
exports.notifikasiPesanBaru = onValueCreated(
  { ref: '/chats/{chatId}/messages/{msgId}', region: 'asia-southeast1' },
  async (event) => {
    const pesan = event.data.val();
    const { chatId } = event.params;
    const rtdb = admin.database();

    const meta = (await rtdb.ref(`chats/${chatId}/meta`).get()).val();
    if (!meta) return;

    const penerima = Object.keys(meta.members || {}).filter((uid) => uid !== pesan.senderId);
    if (penerima.length === 0) return;

    if (!pesan || typeof pesan.senderId !== 'string') return;

    const kumpulan = await Promise.all(penerima.map(async (uid) => {
      const snap = await rtdb.ref(`fcmTokens/${uid}`).get();
      return bacaTokenPerangkat(uid, snap.val());
    }));
    const daftar = kumpulan.flat();
    if (daftar.length === 0) return;

    const data = buatPayloadNotifikasi({ chatId, pesan, meta });
    for (const kelompok of kelompokkanToken(daftar)) {
      const hasil = await admin.messaging().sendEachForMulticast({
        tokens: kelompok.map((item) => item.token),
        data,
      });

      const bersih = [];
      hasil.responses.forEach((respons, i) => {
        const kode = respons.error?.code;
        if (!respons.success && [
          'messaging/registration-token-not-registered',
          'messaging/invalid-registration-token',
        ].includes(kode)) {
          const token = kelompok[i];
          bersih.push(rtdb.ref(`fcmTokens/${token.uid}/${token.tokenId}`).remove());
        }
      });
      await Promise.all(bersih);
    }
  }
);

// ========== Pembuatan chat aman (rekomendasi produksi) ==========
// Setelah aktif, ubah rules meta.write menjadi false dan userChats write hanya owner.
exports.buatChat = onCall({ region: 'asia-southeast1' }, async (request) => {
  if (!request.auth) throw new HttpsError('unauthenticated', 'Silakan login.');
  const uid = request.auth.uid;
  const { role, tenantId } = request.auth.token || {};
  const { tipe, nama = '', anggota = [] } = request.data || {};

  if (!['direct', 'group'].includes(tipe)) {
    throw new HttpsError('invalid-argument', 'Tipe tidak valid.');
  }
  const unik = [...new Set([uid, ...anggota])];
  if (tipe === 'direct' && unik.length !== 2) {
    throw new HttpsError('invalid-argument', 'Chat pribadi harus 2 orang.');
  }
  if (tipe === 'group' && (unik.length < 2 || unik.length > 50 || !nama.trim())) {
    throw new HttpsError('invalid-argument', 'Grup butuh nama dan 2-50 anggota.');
  }

  const db = getFirestore('default');
  const dokumen = await Promise.all(unik.map((u) => db.doc(`directory/${u}`).get()));
  const profil = {};
  for (const d of dokumen) {
    if (!d.exists) throw new HttpsError('not-found', 'Ada pengguna yang tidak ditemukan.');
    if (role !== 'superadmin' && d.data().tenantId !== tenantId) {
      throw new HttpsError('permission-denied', 'Semua anggota harus berasal dari sekolah yang sama.');
    }
    profil[d.id] = d.data().nama;
  }

  const rtdb = admin.database();
  const chatId = tipe === 'direct'
    ? `d_${[...unik].sort().join('_')}`
    : rtdb.ref('chats').push().key;
  const sekarang = admin.database.ServerValue.TIMESTAMP;
  const members = Object.fromEntries(unik.map((u) => [u, true]));

  const tulis = {
    [`chats/${chatId}/meta`]: {
      type: tipe,
      ...(tipe === 'group' ? { name: nama.trim() } : {}),
      members,
      names: profil,
      createdBy: uid,
      createdAt: sekarang
    }
  };
  unik.forEach((u) => {
    const lawan = unik.find((x) => x !== u);
    tulis[`userChats/${u}/${chatId}`] = {
      type: tipe,
      name: tipe === 'group' ? nama.trim() : profil[lawan],
      ...(tipe === 'direct' ? { peerUid: lawan } : {}),
      lastText: '',
      lastTs: sekarang,
      unread: 0
    };
  });
  await rtdb.ref().update(tulis);
  return { chatId };
});
