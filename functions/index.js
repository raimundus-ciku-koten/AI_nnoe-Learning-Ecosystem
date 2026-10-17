'use strict';
const { onCall, onRequest, HttpsError } = require('firebase-functions/v2/https');
const { defineSecret, defineString, defineInt } = require('firebase-functions/params');
const { getFirestore } = require('firebase-admin/firestore');
const logger = require('firebase-functions/logger');
const admin = require('firebase-admin');
const { tangani, GalatLayanan } = require('./lib/handler');
const { tanganiAsisten, GalatAsisten } = require('./lib/assistant');
const { tanganiSoal, GalatSoal } = require('./lib/questionGenerator');
const crypto = require('node:crypto');
const {
  cariPaket, peranBolehMembeli, hitungTagihan, tanggalAkhirSiklus, statusMidtrans, signatureValid,
} = require('./lib/billing');
const { createPlatformControlService, PlatformControlError } = require('./lib/platformControls');
const { createPlatformUserService, PlatformUserError } = require('./lib/platformUsers');
const {
  PATH: AI_SETTINGS_PATH,
  keyRing: parseAiKeyRing,
  encryptSecret: encryptAiSecret,
  decryptSecret: decryptAiSecret,
  validateApiKey,
  validateWorkflowPreference,
  readPrivateSettings,
  resolveUserConfig,
  connectionStatus
} = require('./lib/aiUserSettings');

admin.initializeApp();
const db = getFirestore('default');
exports.notifikasiPesanBaru = require('./chat-functions').notifikasiPesanBaru;
const platformControls = createPlatformControlService({
  db,
  fieldValue: admin.firestore.FieldValue,
  randomUUID: crypto.randomUUID,
});
const platformUsers = createPlatformUserService({
  auth: admin.auth(),
  db,
  fieldValue: admin.firestore.FieldValue,
  randomUUID: crypto.randomUUID,
  onCleanupError: (error, uid) => logger.error('Failed to roll back newly provisioned user', {
    uid,
    name: error?.name,
  }),
});

async function pastikanPlatformAktif(req) {
  if (!req.auth) throw new HttpsError('unauthenticated', 'Silakan masuk untuk melanjutkan.');
  if (req.auth?.token?.role === 'superadmin') return;
  if (await platformControls.isMaintenanceEnabled()) {
    throw new HttpsError('failed-precondition', 'Platform sedang dalam pemeliharaan. Silakan coba kembali nanti.');
  }
}

const GEMINI_API_KEYS = defineSecret('GEMINI_API_KEYS');   // daftar dipisah koma; semua dicoba lebih dulu
const DEEPSEEK_API_KEY = defineSecret('DEEPSEEK_API_KEY'); // cadangan bila semua kunci Gemini gagal
const GROQ_API_KEY = defineSecret('GROQ_API_KEY');
const CEREBRAS_API_KEY = defineSecret('CEREBRAS_API_KEY');
const AI_CREDENTIALS_KEYRING = defineSecret('AI_CREDENTIALS_KEYRING');
const GEMINI_MODEL = defineString('GEMINI_MODEL', { default: 'gemini-2.5-flash' });
const DEEPSEEK_MODEL = defineString('DEEPSEEK_MODEL', { default: 'deepseek-chat' });
const GROQ_MODEL = defineString('GROQ_MODEL', { default: 'llama-3.3-70b-versatile' });
const CEREBRAS_MODEL = defineString('CEREBRAS_MODEL', { default: 'qwen-3.8-27b' });
const CANVA_CLIENT_ID = defineString('CANVA_CLIENT_ID', { default: '' });
const CANVA_REDIRECT_URI = defineString('CANVA_REDIRECT_URI', { default: '' });
const CANVA_CLIENT_SECRET = defineSecret('CANVA_CLIENT_SECRET');
const BATAS_PER_JAM = defineInt('AI_BATAS_PER_JAM', { default: 20 });
const BATAS_PER_HARI = defineInt('AI_BATAS_PER_HARI', { default: 100 });
const MIDTRANS_SERVER_KEY = defineSecret('MIDTRANS_SERVER_KEY');
const MIDTRANS_MODE = defineString('MIDTRANS_MODE', { default: 'sandbox' });
const BILLING_PPN_RATE = defineString('BILLING_PPN_RATE', { default: '0.11' });

function sharedAiConfig() {
  return {
    geminiKeys: GEMINI_API_KEYS.value().split(',').map((key) => key.trim()).filter(Boolean),
    geminiModel: GEMINI_MODEL.value(),
    deepseekKey: DEEPSEEK_API_KEY.value() || '',
    deepseekModel: DEEPSEEK_MODEL.value(),
    groqKey: GROQ_API_KEY.value() || '',
    groqModel: GROQ_MODEL.value(),
    cerebrasKey: CEREBRAS_API_KEY.value() || '',
    cerebrasModel: CEREBRAS_MODEL.value(),
    perJam: BATAS_PER_JAM.value(),
    perHari: BATAS_PER_HARI.value()
  };
}

async function aiConfigForUser(uid, workflow) {
  const [settings, rawKeyRing] = await Promise.all([
    readPrivateSettings(db, uid),
    Promise.resolve(AI_CREDENTIALS_KEYRING.value())
  ]);
  const config = resolveUserConfig(settings, parseAiKeyRing(rawKeyRing), sharedAiConfig(), uid);
  return {
    ...config,
    preferredProvider: config.preferences[workflow] || 'auto'
  };
}

function midtransBaseUrl() {
  return MIDTRANS_MODE.value() === 'production'
    ? 'https://app.midtrans.com'
    : 'https://app.sandbox.midtrans.com';
}

function midtransApiBaseUrl() {
  return MIDTRANS_MODE.value() === 'production'
    ? 'https://api.midtrans.com'
    : 'https://api.sandbox.midtrans.com';
}

function basicAuth(serverKey) {
  return `Basic ${Buffer.from(`${serverKey}:`).toString('base64')}`;
}

async function hapusReservasiPembelian(db, tenantRef, orderId) {
  await db.runTransaction(async (transaction) => {
    const tenantSnap = await transaction.get(tenantRef);
    if (tenantSnap.exists && tenantSnap.get('billingReservation.orderId') === orderId) {
      transaction.update(tenantRef, {
        billingReservation: admin.firestore.FieldValue.delete(),
      });
    }
  });
}

function seatsSama(seatsA = {}, seatsB = {}) {
  const roles = new Set([...Object.keys(seatsA), ...Object.keys(seatsB)]);
  return [...roles].every((role) => (seatsA[role] ?? 0) === (seatsB[role] ?? 0));
}

/**
 * Buat checkout berlangganan sekolah. Harga, pajak, tenant, dan status pembayaran
 * dihitung/ditetapkan di server; klien hanya mengirim jumlah seat dan siklus.
 */
exports.buatPembayaran = onCall({
  region: 'asia-southeast2',
  enforceAppCheck: true,
  secrets: [MIDTRANS_SERVER_KEY],
  timeoutSeconds: 30,
  maxInstances: 10,
}, async (req) => {
  if (!req.auth) throw new HttpsError('unauthenticated', 'Silakan masuk sebelum melakukan purchase.');
  await pastikanPlatformAktif(req);
  const { role, tenantId } = req.auth.token;
  if (role !== 'admin_sekolah' || typeof tenantId !== 'string' || !tenantId) {
    throw new HttpsError('permission-denied', 'Purchase hanya dapat dilakukan oleh admin sekolah.');
  }
  throw new HttpsError(
    'failed-precondition',
    'Checkout per-seat lama sudah dihentikan. Muat ulang halaman untuk memilih paket terbaru.',
  );

  /* istanbul ignore next -- retained temporarily to finish pre-existing checkout reservations */
  const serverKey = MIDTRANS_SERVER_KEY.value();
  if (!serverKey) throw new HttpsError('failed-precondition', 'Gateway pembayaran belum dikonfigurasi.');

  const tenantRef = db.doc(`tenants/${tenantId}`);
  const orderId = `ALE-${crypto.randomUUID()}`;
  const orderRef = db.doc(`billingOrders/${orderId}`);
  const now = new Date();
  const reservationUntil = new Date(now.getTime() + 24 * 60 * 60 * 1000);
  let tagihan;
  let langgananSebelumnya = null;
  try {
    await db.runTransaction(async (transaction) => {
      const tenantSnap = await transaction.get(tenantRef);
      if (!tenantSnap.exists) {
        throw new HttpsError('failed-precondition', 'Data sekolah belum tersedia.');
      }
      const reservasi = tenantSnap.get('billingReservation');
      if (reservasi?.expiresAt?.toDate?.() > now) {
        throw new HttpsError('failed-precondition', 'Checkout lain masih aktif. Selesaikan atau tunggu hingga kedaluwarsa.');
      }

      const existing = tenantSnap.get('langganan') || {};
      const mulai = existing.mulai?.toDate?.();
      const sampai = existing.sampai?.toDate?.();
      const aktif = existing.aktif === true && mulai instanceof Date &&
        sampai instanceof Date && mulai < sampai && sampai > now;
      let prorata = null;
      if (aktif) {
        const seatsSebelumnya = existing.seats || {};
        const seatsBaru = req.data?.seats || {};
        const roles = ['admin', 'guru', 'siswa', 'ortu', 'ortuGratis'];
        if (roles.some((peran) => (seatsBaru[peran] ?? 0) < (seatsSebelumnya[peran] ?? 0))) {
          throw new HttpsError('failed-precondition', 'Seat tidak dapat dikurangi sebelum periode aktif berakhir.');
        }
        if (roles.some((peran) => (seatsBaru[peran] ?? 0) > (seatsSebelumnya[peran] ?? 0))) {
          if (req.data?.siklus !== existing.siklus) {
            throw new HttpsError('failed-precondition', 'Siklus purchase seat tambahan harus sama dengan langganan aktif.');
          }
          prorata = {
            porsi: Math.min(1, (sampai - now) / (sampai - mulai)),
            seatsSebelumnya,
          };
          langgananSebelumnya = {
            mulai: admin.firestore.Timestamp.fromDate(mulai),
            sampai: admin.firestore.Timestamp.fromDate(sampai),
            seats: seatsSebelumnya,
          };
        }
      }

      tagihan = hitungTagihan(req.data, Number(BILLING_PPN_RATE.value()), prorata);
      transaction.update(tenantRef, {
        billingReservation: {
          orderId,
          expiresAt: admin.firestore.Timestamp.fromDate(reservationUntil),
        },
      });
    });
  } catch (error) {
    if (error instanceof HttpsError) throw error;
    if (error instanceof TypeError) throw new HttpsError('invalid-argument', error.message);
    logger.error('Failed to reserve billing checkout', { name: error?.name });
    throw new HttpsError('internal', 'Tidak dapat menyiapkan purchase. Silakan coba lagi.');
  }

  const tenantSnap = await tenantRef.get();
  const namaSekolah = String(tenantSnap.get('nama') || 'Sekolah').slice(0, 50);
  const itemDetails = tagihan.rincian.map((item) => ({
    id: item.peran,
    name: `${item.peran} - ${tagihan.prorata ? 'tambahan seat prorata' : `lisensi ${tagihan.siklus}`}`,
    price: item.hargaSatuan,
    quantity: item.jumlah,
  }));
  if (tagihan.ppn > 0) {
    itemDetails.push({ id: 'ppn', name: 'PPN', price: tagihan.ppn, quantity: 1 });
  }

  const invoice = {
    orderId,
    tenantId,
    createdBy: req.auth.uid,
    email: String(req.auth.token.email || '').slice(0, 254),
    namaSekolah,
    status: 'creating',
    siklus: tagihan.siklus,
    seats: tagihan.seats,
    seatsDitambahkan: tagihan.seatsDitambahkan,
    prorata: tagihan.prorata,
    porsiProrata: tagihan.porsiProrata,
    langgananSebelumnya,
    rincian: tagihan.rincian,
    subtotal: tagihan.subtotal,
    tarifPpn: tagihan.tarifPpn,
    ppn: tagihan.ppn,
    total: tagihan.total,
    createdAt: admin.firestore.FieldValue.serverTimestamp(),
    updatedAt: admin.firestore.FieldValue.serverTimestamp(),
  };
  try {
    await orderRef.create(invoice);
  } catch (error) {
    await hapusReservasiPembelian(db, tenantRef, orderId);
    throw error;
  }

  let response;
  try {
    response = await fetch(`${midtransBaseUrl()}/snap/v1/transactions`, {
      method: 'POST',
      headers: {
        Accept: 'application/json',
        Authorization: basicAuth(serverKey),
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        transaction_details: { order_id: orderId, gross_amount: tagihan.total },
        item_details: itemDetails,
        customer_details: {
          first_name: String(req.auth.token.name || namaSekolah).slice(0, 50),
          email: invoice.email,
        },
        expiry: { unit: 'hour', duration: 24 },
      }),
      signal: AbortSignal.timeout(15000),
    });
  } catch (error) {
    await orderRef.update({
      status: 'failed',
      failureReason: 'gateway_unavailable',
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    });
    await hapusReservasiPembelian(db, tenantRef, orderId);
    logger.error('Midtrans create transaction request failed', { name: error?.name });
    throw new HttpsError('unavailable', 'Gateway pembayaran tidak dapat dihubungi. Silakan coba lagi.');
  }

  let result;
  try {
    result = await response.json();
  } catch {
    result = {};
  }
  if (!response.ok || typeof result.redirect_url !== 'string') {
    await orderRef.update({
      status: 'failed',
      failureReason: `gateway_http_${response.status}`,
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    });
    await hapusReservasiPembelian(db, tenantRef, orderId);
    logger.error('Midtrans rejected create transaction', { status: response.status });
    throw new HttpsError('unavailable', 'Gateway tidak dapat membuat checkout. Periksa konfigurasi merchant.');
  }

  const redirect = new URL(result.redirect_url);
  const hostDiizinkan = MIDTRANS_MODE.value() === 'production'
    ? 'app.midtrans.com'
    : 'app.sandbox.midtrans.com';
  if (redirect.protocol !== 'https:' || redirect.hostname !== hostDiizinkan) {
    await orderRef.update({ status: 'failed', failureReason: 'invalid_gateway_url' });
    await hapusReservasiPembelian(db, tenantRef, orderId);
    throw new HttpsError('internal', 'Gateway mengembalikan alamat checkout yang tidak valid.');
  }
  await orderRef.update({
    status: 'pending',
    midtransTransactionId: String(result.token || '').slice(0, 128),
    updatedAt: admin.firestore.FieldValue.serverTimestamp(),
  });
  return { orderId, redirectUrl: redirect.href, total: tagihan.total };
});

/**
 * Checkout paket resmi dari panduan: paket sekolah untuk admin atau paket pribadi
 * untuk siswa/guru. Harga, penerima entitlement, dan siklus ditentukan server.
 */
exports.buatPembayaranPaket = onCall({
  region: 'asia-southeast2',
  enforceAppCheck: true,
  secrets: [MIDTRANS_SERVER_KEY],
  timeoutSeconds: 30,
  maxInstances: 10,
}, async (req) => {
  if (!req.auth) throw new HttpsError('unauthenticated', 'Silakan masuk sebelum melakukan purchase.');
  await pastikanPlatformAktif(req);

  const { role, tenantId } = req.auth.token;
  const productType = req.data?.productType;
  const planId = req.data?.planId;
  const siklus = req.data?.siklus;
  const paket = cariPaket(productType, planId);
  if (!paket || !['bulanan', 'tahunan'].includes(siklus)) {
    throw new HttpsError('invalid-argument', 'Paket atau siklus pembayaran tidak valid.');
  }
  if (!peranBolehMembeli(role, productType, planId)) {
    throw new HttpsError('permission-denied', 'Paket ini tidak tersedia untuk peran akun Anda.');
  }
  if (typeof tenantId !== 'string' || !tenantId) {
    throw new HttpsError('failed-precondition', 'Akun belum terhubung ke sekolah.');
  }

  const serverKey = MIDTRANS_SERVER_KEY.value();
  if (!serverKey) throw new HttpsError('failed-precondition', 'Gateway pembayaran belum dikonfigurasi.');
  const orderId = `ALE-${crypto.randomUUID()}`;
  const orderRef = db.doc(`billingOrders/${orderId}`);
  const ownerRef = productType === 'school'
    ? db.doc(`tenants/${tenantId}`)
    : db.doc(`userSubscriptions/${req.auth.uid}`);
  const subscriptionField = productType === 'school' ? 'langganan' : 'subscription';
  const reservationUntil = new Date(Date.now() + 24 * 60 * 60 * 1000);
  let tagihan;

  try {
    await db.runTransaction(async (transaction) => {
      const ownerSnap = await transaction.get(ownerRef);
      if (productType === 'school' && !ownerSnap.exists) {
        throw new HttpsError(
          'failed-precondition',
          'Data sekolah belum tersedia.',
        );
      }
      const reservation = ownerSnap.exists ? ownerSnap.get('billingReservation') : null;
      if (reservation?.expiresAt?.toDate?.() > new Date()) {
        throw new HttpsError('failed-precondition', 'Checkout lain masih aktif. Selesaikan atau tunggu hingga kedaluwarsa.');
      }
      const current = ownerSnap.exists ? ownerSnap.get(subscriptionField) || {} : {};
      const mulai = current.mulai?.toDate?.();
      const sampai = current.sampai?.toDate?.();
      const aktif = current.aktif === true && mulai instanceof Date &&
        sampai instanceof Date && mulai < sampai && sampai > new Date();
      if (aktif && (current.paketId !== planId || current.siklus !== siklus)) {
        throw new HttpsError(
          'failed-precondition',
          'Paket atau siklus berbeda tidak dapat ditumpuk selama langganan aktif. Ubah paket setelah periode berakhir.',
        );
      }

      tagihan = hitungTagihan({ productType, planId, siklus }, Number(BILLING_PPN_RATE.value()));
      transaction.set(ownerRef, {
        billingReservation: {
          orderId,
          expiresAt: admin.firestore.Timestamp.fromDate(reservationUntil),
        },
      }, { merge: true });
    });
  } catch (error) {
    if (error instanceof HttpsError) throw error;
    if (error instanceof TypeError) throw new HttpsError('invalid-argument', error.message);
    logger.error('Failed to reserve package checkout', { name: error?.name });
    throw new HttpsError('internal', 'Tidak dapat menyiapkan purchase. Silakan coba lagi.');
  }

  const invoice = {
    orderId,
    productType,
    planId: tagihan.planId,
    planName: tagihan.planName,
    userType: paket.userType || null,
    userId: req.auth.uid,
    tenantId,
    createdBy: req.auth.uid,
    email: String(req.auth.token.email || '').slice(0, 254),
    status: 'creating',
    siklus: tagihan.siklus,
    rincian: tagihan.rincian,
    subtotal: tagihan.subtotal,
    tarifPpn: tagihan.tarifPpn,
    ppn: tagihan.ppn,
    total: tagihan.total,
    kapasitas: tagihan.kapasitas,
    createdAt: admin.firestore.FieldValue.serverTimestamp(),
    updatedAt: admin.firestore.FieldValue.serverTimestamp(),
  };
  try {
    await orderRef.create(invoice);
  } catch (error) {
    await hapusReservasiPembelian(db, ownerRef, orderId);
    throw error;
  }

  let response;
  try {
    response = await fetch(`${midtransBaseUrl()}/snap/v1/transactions`, {
      method: 'POST',
      headers: {
        Accept: 'application/json',
        Authorization: basicAuth(serverKey),
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        transaction_details: { order_id: orderId, gross_amount: tagihan.total },
        item_details: [
          { id: planId, name: `${tagihan.planName} - lisensi ${siklus}`, price: tagihan.subtotal, quantity: 1 },
          ...(tagihan.ppn ? [{ id: 'ppn', name: 'PPN', price: tagihan.ppn, quantity: 1 }] : []),
        ],
        customer_details: {
          first_name: String(req.auth.token.name || tagihan.planName).slice(0, 50),
          email: invoice.email,
        },
        expiry: { unit: 'hour', duration: 24 },
      }),
      signal: AbortSignal.timeout(15000),
    });
  } catch (error) {
    await orderRef.update({
      status: 'failed',
      failureReason: 'gateway_unavailable',
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    });
    await hapusReservasiPembelian(db, ownerRef, orderId);
    logger.error('Midtrans package checkout request failed', { name: error?.name });
    throw new HttpsError('unavailable', 'Gateway pembayaran tidak dapat dihubungi. Silakan coba lagi.');
  }

  let result;
  try {
    result = await response.json();
  } catch {
    result = {};
  }
  if (!response.ok || typeof result.redirect_url !== 'string') {
    await orderRef.update({
      status: 'failed',
      failureReason: `gateway_http_${response.status}`,
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    });
    await hapusReservasiPembelian(db, ownerRef, orderId);
    logger.error('Midtrans rejected package checkout', { status: response.status });
    throw new HttpsError('unavailable', 'Gateway tidak dapat membuat checkout. Periksa konfigurasi merchant.');
  }

  const redirect = new URL(result.redirect_url);
  const hostDiizinkan = MIDTRANS_MODE.value() === 'production'
    ? 'app.midtrans.com'
    : 'app.sandbox.midtrans.com';
  if (redirect.protocol !== 'https:' || redirect.hostname !== hostDiizinkan) {
    await orderRef.update({
      status: 'failed',
      failureReason: 'invalid_gateway_url',
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    });
    await hapusReservasiPembelian(db, ownerRef, orderId);
    throw new HttpsError('internal', 'Gateway mengembalikan alamat checkout yang tidak valid.');
  }
  await orderRef.update({
    status: 'pending',
    midtransTransactionId: String(result.token || '').slice(0, 128),
    updatedAt: admin.firestore.FieldValue.serverTimestamp(),
  });
  return { orderId, redirectUrl: redirect.href, total: tagihan.total };
});

/**
 * Webhook Midtrans: cek signature, verifikasi ulang status ke API Midtrans,
 * lalu aktifkan langganan secara atomik setelah pembayaran benar-benar lunas.
 */
exports.midtransWebhook = onRequest({
  region: 'asia-southeast2',
  secrets: [MIDTRANS_SERVER_KEY],
  timeoutSeconds: 30,
  maxInstances: 10,
}, async (req, res) => {
  if (req.method !== 'POST') {
    res.set('Allow', 'POST').status(405).send('Method not allowed');
    return;
  }
  const body = req.body || {};
  const orderId = typeof body.order_id === 'string' ? body.order_id : '';
  const serverKey = MIDTRANS_SERVER_KEY.value();
  if (!signatureValid({
    orderId,
    statusCode: String(body.status_code || ''),
    grossAmount: String(body.gross_amount || ''),
    signatureKey: String(body.signature_key || ''),
    serverKey,
  })) {
    res.status(401).send('Invalid signature');
    return;
  }

  let verified;
  try {
    const result = await fetch(
      `${midtransApiBaseUrl()}/v2/${encodeURIComponent(orderId)}/status`,
      {
        headers: { Accept: 'application/json', Authorization: basicAuth(serverKey) },
        signal: AbortSignal.timeout(10000),
      },
    );
    if (!result.ok) {
      logger.error('Midtrans status verification failed', { status: result.status });
      res.status(502).send('Unable to verify transaction');
      return;
    }
    verified = await result.json();
  } catch (error) {
    logger.error('Midtrans status verification request failed', { name: error?.name });
    res.status(502).send('Unable to verify transaction');
    return;
  }
  if (verified.order_id !== orderId) {
    res.status(400).send('Order mismatch');
    return;
  }

  const orderRef = db.doc(`billingOrders/${orderId}`);
  try {
    await db.runTransaction(async (transaction) => {
      const orderSnap = await transaction.get(orderRef);
      if (!orderSnap.exists) throw new Error('order_not_found');
      const order = orderSnap.data();
      if (Math.round(Number(verified.gross_amount)) !== order.total) throw new Error('amount_mismatch');
      const state = statusMidtrans(verified.transaction_status, verified.fraud_status);
      if (['paid', 'paid_review'].includes(order.status) || state === 'pending') return;

      if (order.productType === 'school' || order.productType === 'individual') {
        const packageOwnerRef = order.productType === 'school'
          ? db.doc(`tenants/${order.tenantId}`)
          : db.doc(`userSubscriptions/${order.userId}`);
        const subscriptionField = order.productType === 'school' ? 'langganan' : 'subscription';
        const ownerSnap = await transaction.get(packageOwnerRef);

        if (state === 'failed') {
          transaction.update(orderRef, {
            status: 'failed',
            paymentStatus: String(verified.transaction_status || ''),
            updatedAt: admin.firestore.FieldValue.serverTimestamp(),
          });
          if (ownerSnap.exists && ownerSnap.get('billingReservation.orderId') === orderId) {
            transaction.update(packageOwnerRef, {
              billingReservation: admin.firestore.FieldValue.delete(),
            });
          }
          return;
        }

        if (!ownerSnap.exists) throw new Error('package_owner_not_found');
        const now = new Date();
        const reservationMatches = ownerSnap.get('billingReservation.orderId') === orderId;
        const current = ownerSnap.get(subscriptionField) || {};
        const currentStart = current.mulai?.toDate?.();
        const currentEnd = current.sampai?.toDate?.();
        const currentActive = current.aktif === true && currentStart instanceof Date &&
          currentEnd instanceof Date && currentStart < currentEnd && currentEnd > now;
        const planChanged = currentActive && current.paketId &&
          (current.paketId !== order.planId || current.siklus !== order.siklus);

        if (!reservationMatches || planChanged) {
          transaction.update(orderRef, {
            status: 'paid_review',
            paymentStatus: String(verified.transaction_status),
            paidAt: admin.firestore.FieldValue.serverTimestamp(),
            updatedAt: admin.firestore.FieldValue.serverTimestamp(),
          });
          if (reservationMatches) {
            transaction.update(packageOwnerRef, {
              billingReservation: admin.firestore.FieldValue.delete(),
            });
          }
          return;
        }

        const start = currentActive ? currentEnd : now;
        const end = tanggalAkhirSiklus(start, order.siklus);
        const subscription = order.productType === 'school'
          ? {
            aktif: true,
            mulai: admin.firestore.Timestamp.fromDate(start),
            sampai: admin.firestore.Timestamp.fromDate(end),
            siklus: order.siklus,
            paketId: order.planId,
            kapasitas: order.kapasitas,
            invoiceId: orderId,
          }
          : {
            aktif: true,
            mulai: admin.firestore.Timestamp.fromDate(start),
            sampai: admin.firestore.Timestamp.fromDate(end),
            siklus: order.siklus,
            paketId: order.planId,
            tipePengguna: order.userType,
            tenantId: order.tenantId,
            invoiceId: orderId,
          };

        transaction.update(orderRef, {
          status: 'paid',
          paymentStatus: String(verified.transaction_status),
          paidAt: admin.firestore.FieldValue.serverTimestamp(),
          updatedAt: admin.firestore.FieldValue.serverTimestamp(),
        });
        transaction.set(packageOwnerRef, {
          [subscriptionField]: subscription,
          billingReservation: admin.firestore.FieldValue.delete(),
        }, { merge: true });
        return;
      }

      const tenantRef = db.doc(`tenants/${order.tenantId}`);
      if (state === 'failed') {
        const tenantSnap = await transaction.get(tenantRef);
        transaction.update(orderRef, {
          status: 'failed',
          paymentStatus: String(verified.transaction_status || ''),
          updatedAt: admin.firestore.FieldValue.serverTimestamp(),
        });
        if (tenantSnap.exists && tenantSnap.get('billingReservation.orderId') === orderId) {
          transaction.update(tenantRef, {
            billingReservation: admin.firestore.FieldValue.delete(),
          });
        }
        return;
      }

      const tenantSnap = await transaction.get(tenantRef);
      if (!tenantSnap.exists) throw new Error('tenant_not_found');
      const now = new Date();
      if (tenantSnap.get('billingReservation.orderId') !== orderId) {
        transaction.update(orderRef, {
          status: 'paid_review',
          paymentStatus: String(verified.transaction_status),
          paidAt: admin.firestore.FieldValue.serverTimestamp(),
          updatedAt: admin.firestore.FieldValue.serverTimestamp(),
        });
        return;
      }
      const current = tenantSnap.get('langganan') || {};
      let start;
      let end;
      if (order.prorata) {
        const existingStart = current.mulai?.toDate?.();
        const existingEnd = current.sampai?.toDate?.();
        const baseline = order.langgananSebelumnya;
        if (!baseline ||
            existingStart?.getTime() !== baseline.mulai?.toDate?.().getTime() ||
            existingEnd?.getTime() !== baseline.sampai?.toDate?.().getTime() ||
            existingEnd <= now ||
            !seatsSama(current.seats, baseline.seats)) {
          transaction.update(orderRef, {
            status: 'paid_review',
            paymentStatus: String(verified.transaction_status),
            paidAt: admin.firestore.FieldValue.serverTimestamp(),
            updatedAt: admin.firestore.FieldValue.serverTimestamp(),
          });
          transaction.update(tenantRef, {
            billingReservation: admin.firestore.FieldValue.delete(),
          });
          return;
        }
        start = existingStart;
        end = existingEnd;
      } else {
        const currentEnd = current.sampai?.toDate?.();
        start = current.aktif === true && currentEnd && currentEnd > now ? currentEnd : now;
        end = tanggalAkhirSiklus(start, order.siklus);
      }
      transaction.update(orderRef, {
        status: 'paid',
        paymentStatus: String(verified.transaction_status),
        paidAt: admin.firestore.FieldValue.serverTimestamp(),
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      });
      transaction.update(tenantRef, {
        langganan: {
          aktif: true,
          mulai: admin.firestore.Timestamp.fromDate(start),
          sampai: admin.firestore.Timestamp.fromDate(end),
          siklus: order.siklus,
          seats: order.seats,
          invoiceId: orderId,
        },
        billingReservation: admin.firestore.FieldValue.delete(),
      });
    });
  } catch (error) {
    if (error.message === 'order_not_found') {
      res.status(404).send('Order not found');
      return;
    }
    if (error.message === 'amount_mismatch') {
      logger.error('Midtrans amount mismatch', { orderId });
      res.status(400).send('Amount mismatch');
      return;
    }
    logger.error('Midtrans webhook processing failed', { name: error?.name });
    res.status(500).send('Unable to process notification');
    return;
  }
  res.status(200).send('OK');
});

exports.getAIProviderConnections = onCall({
  region: 'asia-southeast2',
  enforceAppCheck: true,
  secrets: [GEMINI_API_KEYS, DEEPSEEK_API_KEY, GROQ_API_KEY, CEREBRAS_API_KEY, AI_CREDENTIALS_KEYRING, CANVA_CLIENT_SECRET],
  timeoutSeconds: 15,
  maxInstances: 10
}, async (req) => {
  await pastikanPlatformAktif(req);
  try {
    const settings = await readPrivateSettings(db, req.auth.uid);
    return {
      ...connectionStatus(settings, sharedAiConfig()),
      personalKeysEnabled: settings.usePersonalKeys !== false,
      canvaOAuthReady: Boolean(CANVA_CLIENT_ID.value() && CANVA_CLIENT_SECRET.value() && CANVA_REDIRECT_URI.value())
    };
  } catch (error) {
    logger.error('Failed to load AI provider status', { name: error?.name });
    throw new HttpsError('failed-precondition', 'Status provider AI belum tersedia. Periksa konfigurasi server.');
  }
});

exports.savePersonalAIProviderKey = onCall({
  region: 'asia-southeast2',
  enforceAppCheck: true,
  secrets: [AI_CREDENTIALS_KEYRING],
  timeoutSeconds: 15,
  maxInstances: 5
}, async (req) => {
  await pastikanPlatformAktif(req);
  const { provider, apiKey } = req.data ?? {};
  try {
    validateApiKey(provider, apiKey);
    const encrypted = encryptAiSecret(apiKey, parseAiKeyRing(AI_CREDENTIALS_KEYRING.value()), `${req.auth.uid}:${provider}`);
    await db.doc(AI_SETTINGS_PATH(req.auth.uid)).set({
      credentials: { [provider]: encrypted },
      usePersonalKeys: true,
      updatedAt: admin.firestore.FieldValue.serverTimestamp()
    }, { merge: true });
    return { provider, saved: true };
  } catch (error) {
    if (error instanceof TypeError) throw new HttpsError('invalid-argument', error.message);
    logger.error('Failed to save personal AI provider key', { name: error?.name });
    throw new HttpsError('failed-precondition', 'Kunci pribadi belum dapat disimpan. Periksa konfigurasi enkripsi server.');
  }
});

exports.removePersonalAIProviderKey = onCall({
  region: 'asia-southeast2',
  enforceAppCheck: true,
  timeoutSeconds: 15,
  maxInstances: 5
}, async (req) => {
  await pastikanPlatformAktif(req);
  const { provider } = req.data ?? {};
  if (!['gemini', 'deepseek', 'groq', 'cerebras'].includes(provider)) {
    throw new HttpsError('invalid-argument', 'Provider tidak valid.');
  }
  const reference = db.doc(AI_SETTINGS_PATH(req.auth.uid));
  const snapshot = await reference.get();
  if (snapshot.exists) {
    await reference.update({
      [`credentials.${provider}`]: admin.firestore.FieldValue.delete(),
      updatedAt: admin.firestore.FieldValue.serverTimestamp()
    });
  }
  return { provider, removed: true };
});

exports.setAIProviderPreference = onCall({
  region: 'asia-southeast2',
  enforceAppCheck: true,
  timeoutSeconds: 15,
  maxInstances: 5
}, async (req) => {
  await pastikanPlatformAktif(req);
  const { workflow, provider } = req.data ?? {};
  try {
    validateWorkflowPreference(workflow, provider);
  } catch (error) {
    throw new HttpsError('invalid-argument', error.message);
  }
  await db.doc(AI_SETTINGS_PATH(req.auth.uid)).set({
    preferences: { [workflow]: provider },
    updatedAt: admin.firestore.FieldValue.serverTimestamp()
  }, { merge: true });
  return { workflow, provider };
});

exports.startCanvaOAuth = onCall({
  region: 'asia-southeast2',
  enforceAppCheck: true,
  secrets: [CANVA_CLIENT_SECRET],
  timeoutSeconds: 15,
  maxInstances: 5
}, async (req) => {
  await pastikanPlatformAktif(req);
  const clientId = CANVA_CLIENT_ID.value();
  const redirectUri = CANVA_REDIRECT_URI.value();
  if (!clientId || !CANVA_CLIENT_SECRET.value() || !redirectUri) {
    throw new HttpsError('failed-precondition', 'Canva OAuth belum dikonfigurasi oleh administrator.');
  }
  const state = crypto.randomBytes(32).toString('base64url');
  const stateId = crypto.createHash('sha256').update(state).digest('hex');
  const codeVerifier = crypto.randomBytes(32).toString('base64url');
  const codeChallenge = crypto.createHash('sha256').update(codeVerifier).digest('base64url');
  await db.doc(`privateCanvaOAuthStates/${stateId}`).set({
    uid: req.auth.uid,
    codeVerifier,
    createdAt: admin.firestore.FieldValue.serverTimestamp(),
    expiresAt: admin.firestore.Timestamp.fromMillis(Date.now() + 10 * 60 * 1000)
  });
  const authorize = new URL('https://www.canva.com/api/oauth/authorize');
  authorize.search = new URLSearchParams({
    client_id: clientId,
    response_type: 'code',
    scope: 'design:content:write',
    redirect_uri: redirectUri,
    state,
    code_challenge: codeChallenge,
    code_challenge_method: 'S256'
  }).toString();
  return { authorizationUrl: authorize.toString() };
});

exports.canvaOAuthCallback = onRequest({
  region: 'asia-southeast2',
  secrets: [CANVA_CLIENT_SECRET, AI_CREDENTIALS_KEYRING],
  timeoutSeconds: 30,
  maxInstances: 5
}, async (req, res) => {
  res.set('Cache-Control', 'no-store');
  const code = typeof req.query.code === 'string' ? req.query.code : '';
  const state = typeof req.query.state === 'string' ? req.query.state : '';
  if (req.method !== 'GET' || !code || !state || code.length > 4096 || state.length > 256) {
    res.status(400).send('Canva authorization was not completed. Return to the application and try again.');
    return;
  }
  try {
    const stateId = crypto.createHash('sha256').update(state).digest('hex');
    const stateRef = db.doc(`privateCanvaOAuthStates/${stateId}`);
    const stateData = await db.runTransaction(async (transaction) => {
      const snapshot = await transaction.get(stateRef);
      if (!snapshot.exists || snapshot.get('expiresAt').toMillis() <= Date.now()) return null;
      transaction.delete(stateRef);
      return snapshot.data();
    });
    if (!stateData?.uid || !stateData.codeVerifier) {
      res.status(400).send('Canva authorization expired or was already used. Return to the application and try again.');
      return;
    }
    const tokenResponse = await fetch('https://api.canva.com/rest/v1/oauth/token', {
      method: 'POST',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        grant_type: 'authorization_code',
        code,
        code_verifier: stateData.codeVerifier,
        client_id: CANVA_CLIENT_ID.value(),
        client_secret: CANVA_CLIENT_SECRET.value(),
        redirect_uri: CANVA_REDIRECT_URI.value()
      }),
      signal: AbortSignal.timeout(15_000)
    });
    if (!tokenResponse.ok) {
      logger.warn('Canva OAuth token exchange failed', { status: tokenResponse.status });
      res.status(502).send('Canva authorization could not be completed. Return to the application and try again.');
      return;
    }
    const token = await tokenResponse.json();
    if (typeof token.access_token !== 'string' || typeof token.refresh_token !== 'string' ||
        !Number.isFinite(Number(token.expires_in))) {
      res.status(502).send('Canva returned an invalid authorization response.');
      return;
    }
    const keyring = parseAiKeyRing(AI_CREDENTIALS_KEYRING.value());
    const encrypted = encryptAiSecret(JSON.stringify({
      accessToken: token.access_token,
      refreshToken: token.refresh_token,
      expiresAt: Date.now() + Number(token.expires_in) * 1000
    }), keyring, `${stateData.uid}:canva`);
    await db.doc(AI_SETTINGS_PATH(stateData.uid)).set({
      credentials: { canva: encrypted },
      updatedAt: admin.firestore.FieldValue.serverTimestamp()
    }, { merge: true });
    const appUrl = `https://${admin.app().options.projectId}.web.app/#/pengaturan/api-ai?canva=connected`;
    res.status(200).type('html').send(
      `<!doctype html><html lang="id"><meta charset="utf-8"><title>Canva terhubung</title>` +
      `<body><main><h1>Akun Canva berhasil dihubungkan</h1><p>Kembali ke aplikasi untuk melanjutkan.</p>` +
      `<a href="${appUrl}">Kembali ke AI &amp; Layanan</a></main></body></html>`
    );
  } catch (error) {
    logger.error('Canva OAuth callback failed', { name: error?.name });
    res.status(500).send('Canva could not be connected. Return to the application and try again.');
  }
});

exports.createCanvaQuestionDesign = onCall({
  region: 'asia-southeast2',
  enforceAppCheck: true,
  secrets: [AI_CREDENTIALS_KEYRING, CANVA_CLIENT_SECRET],
  timeoutSeconds: 60,
  maxInstances: 5
}, async (req) => {
  await pastikanPlatformAktif(req);
  const title = typeof req.data?.title === 'string' ? req.data.title.trim() : '';
  if (!title || title.length > 100) throw new HttpsError('invalid-argument', 'Judul desain harus berisi 1–100 karakter.');
  const settings = await readPrivateSettings(db, req.auth.uid);
  if (!settings.credentials?.canva) {
    throw new HttpsError('failed-precondition', 'Hubungkan akun Canva terlebih dahulu.');
  }
  try {
    const keyring = parseAiKeyRing(AI_CREDENTIALS_KEYRING.value());
    const tokens = JSON.parse(decryptAiSecret(settings.credentials.canva, keyring, `${req.auth.uid}:canva`));
    let accessToken = tokens.accessToken;
    if (Number(tokens.expiresAt) <= Date.now() + 60_000) {
      const refreshed = await fetch('https://api.canva.com/rest/v1/oauth/token', {
        method: 'POST',
        headers: { 'content-type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({
          grant_type: 'refresh_token',
          refresh_token: tokens.refreshToken,
          client_id: CANVA_CLIENT_ID.value(),
          client_secret: CANVA_CLIENT_SECRET.value()
        }),
        signal: AbortSignal.timeout(15_000)
      });
      if (!refreshed.ok) throw new Error(`Canva token refresh returned ${refreshed.status}.`);
      const next = await refreshed.json();
      if (typeof next.access_token !== 'string' || typeof next.refresh_token !== 'string') {
        throw new Error('Canva token refresh response is invalid.');
      }
      tokens.accessToken = next.access_token;
      tokens.refreshToken = next.refresh_token;
      tokens.expiresAt = Date.now() + Number(next.expires_in) * 1000;
      await db.doc(AI_SETTINGS_PATH(req.auth.uid)).update({
        'credentials.canva': encryptAiSecret(JSON.stringify(tokens), keyring, `${req.auth.uid}:canva`),
        updatedAt: admin.firestore.FieldValue.serverTimestamp()
      });
      accessToken = tokens.accessToken;
    }
    const response = await fetch('https://api.canva.com/rest/v1/designs', {
      method: 'POST',
      headers: {
        authorization: `Bearer ${accessToken}`,
        'content-type': 'application/json'
      },
      body: JSON.stringify({
        type: 'type_and_asset',
        design_type: { type: 'preset', name: 'doc' },
        title
      }),
      signal: AbortSignal.timeout(20_000)
    });
    if (!response.ok) {
      logger.warn('Canva design creation failed', { status: response.status });
      throw new Error('Canva design creation failed.');
    }
    const result = await response.json();
    const design = result?.design;
    if (typeof design?.urls?.edit_url !== 'string' || typeof design?.id !== 'string') {
      throw new Error('Canva design response is invalid.');
    }
    return { id: design.id, editUrl: design.urls.edit_url, title: design.title || title };
  } catch (error) {
    logger.error('Canva question design creation failed', { name: error?.name });
    throw new HttpsError('failed-precondition', 'Desain Canva belum dapat dibuat. Sambungkan ulang Canva atau coba lagi.');
  }
});

exports.generateQuestionDraft = onCall({
  region: 'asia-southeast2',
  enforceAppCheck: true,
  secrets: [GEMINI_API_KEYS, DEEPSEEK_API_KEY, GROQ_API_KEY, CEREBRAS_API_KEY, AI_CREDENTIALS_KEYRING],
  timeoutSeconds: 90,
  memory: '512MiB',
  maxInstances: 10
}, async (req) => {
  await pastikanPlatformAktif(req);
  if (!await platformControls.isFeatureEnabled('aiGeneration')) {
    throw new HttpsError('failed-precondition', 'Pembuatan soal berbantuan AI sedang dinonaktifkan oleh administrator.');
  }
  try {
    const config = await aiConfigForUser(req.auth.uid, 'questions');
    return await tanganiSoal({
      req,
      db,
      config,
      log: (message) => logger.warn(message)
    });
  } catch (error) {
    if (error instanceof GalatSoal) throw new HttpsError(error.kode, error.message);
    logger.error('generateQuestionDraft failed', { name: error?.name });
    throw new HttpsError('internal', 'Tidak dapat membuat draf soal.');
  }
});

/**
 * Membuat ATP, KKTP, atau Modul Ajar (satu unit). App Check wajib; kuota per pengguna.
 * data: { paketId: string, jenis: 'atp'|'kktp'|'modul', noUnit?: number }
 */
exports.generatePerangkat = onCall({
  region: 'asia-southeast2',
  enforceAppCheck: true,
  secrets: [GEMINI_API_KEYS, DEEPSEEK_API_KEY, GROQ_API_KEY, CEREBRAS_API_KEY, AI_CREDENTIALS_KEYRING],
  timeoutSeconds: 120,
  memory: '512MiB',
  maxInstances: 10
}, async (req) => {
  await pastikanPlatformAktif(req);
  if (!await platformControls.isFeatureEnabled('aiGeneration')) {
    throw new HttpsError('failed-precondition', 'Pembuatan perangkat berbantuan AI sedang dinonaktifkan oleh administrator.');
  }
  try {
    return await tangani({
      req,
      db,
      config: await aiConfigForUser(req.auth.uid, 'planning'),
      log: (m) => logger.warn(m)
    });
  } catch (e) {
    if (e instanceof GalatLayanan) throw new HttpsError(e.kode, e.message);
    logger.error('generatePerangkat tak terduga', { nama: e?.name });
    throw new HttpsError('internal', 'Kesalahan tak terduga.');
  }
});

/**
 * Asisten percakapan umum. Kunci provider hanya tersedia di Cloud Functions.
 * Riwayat hanya dipakai untuk menyusun jawaban dan tidak disimpan ke Firestore.
 */
exports.chatAsisten = onCall({
  region: 'asia-southeast2',
  enforceAppCheck: true,
  secrets: [GEMINI_API_KEYS, DEEPSEEK_API_KEY, GROQ_API_KEY, CEREBRAS_API_KEY, AI_CREDENTIALS_KEYRING],
  timeoutSeconds: 120,
  memory: '512MiB',
  maxInstances: 10
}, async (req) => {
  await pastikanPlatformAktif(req);
  if (!await platformControls.isFeatureEnabled('aiAssistant')) {
    throw new HttpsError('failed-precondition', 'Asisten AI sedang dinonaktifkan oleh administrator.');
  }
  try {
    return await tanganiAsisten({
      req,
      db,
      config: {
        ...(await aiConfigForUser(req.auth.uid, 'assistant')),
        perJam: BATAS_PER_JAM.value(),
        perHari: BATAS_PER_HARI.value()
      },
      log: (m) => logger.warn(m)
    });
  } catch (error) {
    if (error instanceof GalatAsisten) throw new HttpsError(error.kode, error.message);
    logger.error('chatAsisten tak terduga', { nama: error?.name });
    throw new HttpsError('internal', 'Kesalahan tak terduga.');
  }
});

exports.setPlatformControl = onCall({
  region: 'asia-southeast2',
  enforceAppCheck: true,
  timeoutSeconds: 15,
  maxInstances: 5,
}, async (req) => {
  if (!req.auth) throw new HttpsError('unauthenticated', 'Silakan masuk sebelum mengubah kontrol platform.');
  if (req.auth.token.role !== 'superadmin') {
    throw new HttpsError('permission-denied', 'Kontrol platform hanya tersedia bagi superadmin.');
  }

  try {
    return await platformControls.setControl(req.auth.uid, req.data);
  } catch (error) {
    if (error instanceof PlatformControlError) {
      throw new HttpsError(error.code, error.message);
    }
    logger.error('Failed to update platform control', { name: error?.name });
    throw new HttpsError('internal', 'Kontrol platform gagal disimpan. Tidak ada perubahan yang dikonfirmasi.');
  }
});

exports.createPlatformUser = onCall({
  region: 'asia-southeast2',
  enforceAppCheck: true,
  timeoutSeconds: 30,
  maxInstances: 5,
}, async (req) => {
  if (!req.auth) throw new HttpsError('unauthenticated', 'Silakan masuk sebelum membuat akun.');
  if (req.auth.token.role !== 'superadmin') {
    throw new HttpsError('permission-denied', 'Pembuatan akun global hanya tersedia bagi superadmin.');
  }

  try {
    await pastikanPlatformAktif(req);
    return await platformUsers.create(req.auth.uid, req.data);
  } catch (error) {
    if (error instanceof PlatformUserError) {
      throw new HttpsError(error.code, error.message);
    }
    logger.error('Failed to provision platform user', { name: error?.name });
    throw new HttpsError('internal', 'Akun gagal dibuat. Tidak ada keberhasilan yang dikonfirmasi.');
  }
});
