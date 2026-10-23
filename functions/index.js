'use strict';
throw new Error('Legacy Firebase Functions diarsipkan dan dinonaktifkan; gunakan Supabase Edge Functions yang telah diverifikasi.');

const { onCall, onRequest, HttpsError } = require('firebase-functions/v2/https');
const { defineSecret, defineString, defineInt } = require('firebase-functions/params');
const { getFirestore } = require('firebase-admin/firestore');
const logger = require('firebase-functions/logger');
const admin = require('firebase-admin');
const { tangani, GalatLayanan } = require('./lib/handler');
const { tanganiAsisten, GalatAsisten } = require('./lib/assistant');
const { tanganiSoal, GalatSoal } = require('./lib/questionGenerator');
const crypto = require('node:crypto');
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
