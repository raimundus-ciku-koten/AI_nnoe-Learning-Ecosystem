'use strict';

const crypto = require('node:crypto');

const PATH = (uid) => `privateAiSettings/${uid}`;
const PROVIDER_IDS = ['gemini', 'deepseek', 'groq', 'cerebras'];
const PROVIDERS = new Set(PROVIDER_IDS);
const PREFERENCES = new Set(['auto', ...PROVIDER_IDS]);
const WORKFLOWS = new Set(['planning', 'assistant', 'questions']);
const MAX_API_KEY_LENGTH = 4096;

function keyRing(raw) {
  let parsed;
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw new Error('AI_CREDENTIALS_KEYRING must be valid JSON.');
  }
  if (!parsed || typeof parsed.active !== 'string' || !parsed.keys ||
      typeof parsed.keys !== 'object' || typeof parsed.keys[parsed.active] !== 'string') {
    throw new Error('AI_CREDENTIALS_KEYRING is missing an active key.');
  }
  const keys = {};
  for (const [version, value] of Object.entries(parsed.keys)) {
    const key = Buffer.from(value, 'base64');
    if (!/^[A-Za-z0-9_-]{1,24}$/.test(version) || key.length !== 32 ||
        key.toString('base64') !== value) {
      throw new Error('Every AI credentials encryption key must be 32 bytes encoded as base64.');
    }
    keys[version] = key;
  }
  return { active: parsed.active, keys };
}

function encryptSecret(value, rawKeyRing, context = '') {
  const ring = typeof rawKeyRing === 'string' ? keyRing(rawKeyRing) : rawKeyRing;
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', ring.keys[ring.active], iv);
  cipher.setAAD(Buffer.from(context, 'utf8'));
  const encrypted = Buffer.concat([cipher.update(value, 'utf8'), cipher.final()]);
  return {
    version: ring.active,
    iv: iv.toString('base64'),
    tag: cipher.getAuthTag().toString('base64'),
    data: encrypted.toString('base64')
  };
}

function decryptSecret(record, rawKeyRing, context = '') {
  const ring = typeof rawKeyRing === 'string' ? keyRing(rawKeyRing) : rawKeyRing;
  const key = ring.keys[record?.version];
  if (!key || typeof record.iv !== 'string' || typeof record.tag !== 'string' ||
      typeof record.data !== 'string') {
    throw new Error('Stored AI credential is invalid or its encryption key is unavailable.');
  }
  const decipher = crypto.createDecipheriv('aes-256-gcm', key, Buffer.from(record.iv, 'base64'));
  decipher.setAAD(Buffer.from(context, 'utf8'));
  decipher.setAuthTag(Buffer.from(record.tag, 'base64'));
  return Buffer.concat([
    decipher.update(Buffer.from(record.data, 'base64')),
    decipher.final()
  ]).toString('utf8');
}

function validProvider(value) {
  return typeof value === 'string' && PROVIDERS.has(value);
}

function validateApiKey(provider, value) {
  if (!validProvider(provider) || typeof value !== 'string' ||
      value.trim() !== value || value.length < 8 || value.length > MAX_API_KEY_LENGTH ||
      /[\u0000-\u0020\u007f]/.test(value)) {
    throw new TypeError('Provider or API key is invalid.');
  }
}

function validateWorkflowPreference(workflow, provider) {
  if (!WORKFLOWS.has(workflow) || !PREFERENCES.has(provider)) {
    throw new TypeError('AI workflow preference is invalid.');
  }
}

async function readPrivateSettings(db, uid) {
  const snap = await db.doc(PATH(uid)).get();
  return snap.exists ? snap.data() : {};
}

function resolveUserConfig(settings, rawKeyRing, shared, uid = '') {
  const credentials = settings?.credentials ?? {};
  const personal = {};
  for (const provider of PROVIDERS) {
    if (credentials[provider]) {
      personal[provider] = decryptSecret(credentials[provider], rawKeyRing, uid ? `${uid}:${provider}` : '');
    }
  }
  const usePersonal = settings?.usePersonalKeys !== false;
  const providerKeys = {};
  for (const provider of PROVIDER_IDS) {
    const sharedKey = provider === 'gemini'
      ? shared.geminiKeys
      : shared[`${provider}Key`];
    providerKeys[provider] = provider === 'gemini'
      ? (usePersonal && personal[provider] ? [personal[provider]] : sharedKey)
      : (usePersonal && personal[provider] ? personal[provider] : sharedKey);
  }
  return {
    ...shared,
    geminiKeys: providerKeys.gemini,
    deepseekKey: providerKeys.deepseek,
    groqKey: providerKeys.groq,
    cerebrasKey: providerKeys.cerebras,
    preferences: settings?.preferences ?? {}
  };
}

function connectionStatus(settings, shared, canvaConfigured = false) {
  const credentials = settings?.credentials ?? {};
  const preferences = settings?.preferences ?? {};
  return {
    providers: {
      gemini: {
        personal: Boolean(credentials.gemini),
        platform: shared.geminiKeys?.some(Boolean) === true,
        available: Boolean(credentials.gemini) || shared.geminiKeys?.some(Boolean) === true
      },
      deepseek: {
        personal: Boolean(credentials.deepseek),
        platform: Boolean(shared.deepseekKey),
        available: Boolean(credentials.deepseek) || Boolean(shared.deepseekKey)
      },
      groq: {
        personal: Boolean(credentials.groq),
        platform: Boolean(shared.groqKey),
        available: Boolean(credentials.groq) || Boolean(shared.groqKey)
      },
      cerebras: {
        personal: Boolean(credentials.cerebras),
        platform: Boolean(shared.cerebrasKey),
        available: Boolean(credentials.cerebras) || Boolean(shared.cerebrasKey)
      },
      claude: {
        personal: false,
        platform: false,
        available: false,
        reason: 'Claude API belum digunakan: belum ada endpoint API gratis yang dapat dikonfirmasi.'
      },
      canva: {
        personal: Boolean(credentials.canva),
        platform: canvaConfigured,
        available: Boolean(credentials.canva),
        connected: Boolean(credentials.canva)
      }
    },
    preferences: {
      planning: PREFERENCES.has(preferences.planning) ? preferences.planning : 'auto',
      assistant: PREFERENCES.has(preferences.assistant) ? preferences.assistant : 'auto',
      questions: PREFERENCES.has(preferences.questions) ? preferences.questions : 'auto'
    }
  };
}

module.exports = {
  PATH,
  PROVIDERS,
  WORKFLOWS,
  keyRing,
  encryptSecret,
  decryptSecret,
  validProvider,
  validateApiKey,
  validateWorkflowPreference,
  readPrivateSettings,
  resolveUserConfig,
  connectionStatus
};
