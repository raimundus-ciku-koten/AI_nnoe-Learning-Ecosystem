import { jalankanAiUserService } from './aiUserServices.js';

const PROVIDERS = ['gemini', 'deepseek', 'groq', 'claude'];
const WORKFLOWS = ['assistant', 'questions'];
const DEFAULT_PREFERENCES = { assistant: 'auto', questions: 'auto' };

function preferencesKey(uid) {
  return `ai-preferences:${uid}`;
}

function muatPreferensi(uid) {
  try {
    const saved = JSON.parse(localStorage.getItem(preferencesKey(uid)) || '{}');
    return Object.fromEntries(WORKFLOWS.map((workflow) => [
      workflow,
      saved[workflow] === 'auto' || PROVIDERS.includes(saved[workflow])
        ? saved[workflow]
        : DEFAULT_PREFERENCES[workflow],
    ]));
  } catch {
    return DEFAULT_PREFERENCES;
  }
}

function requireUid(uid) {
  if (!uid) throw new Error('Sesi login tidak tersedia. Masuk kembali.');
}

export function clearBrowserAiSession() {}

export async function getBrowserAiConnections(uid) {
  requireUid(uid);
  return jalankanAiUserService('status');
}

export async function testAndSaveBrowserKey(uid, provider, apiKey) {
  requireUid(uid);
  return jalankanAiUserService('save-key', { provider, apiKey });
}

export async function removeBrowserKey(uid, provider) {
  requireUid(uid);
  return jalankanAiUserService('remove-key', { provider });
}

export function setBrowserAiPreference(uid, workflow, provider) {
  requireUid(uid);
  if (!WORKFLOWS.includes(workflow) || (provider !== 'auto' && !PROVIDERS.includes(provider))) {
    throw new Error('Preferensi provider AI tidak valid.');
  }
  const next = { ...muatPreferensi(uid), [workflow]: provider };
  localStorage.setItem(preferencesKey(uid), JSON.stringify(next));
  return next;
}

export async function askBrowserAssistant(uid, messages) {
  requireUid(uid);
  return jalankanAiUserService('assistant', {
    messages,
    providerPreference: muatPreferensi(uid).assistant,
  });
}

export async function generateBrowserQuestion(uid, context) {
  requireUid(uid);
  return jalankanAiUserService('question', {
    ...context,
    providerPreference: muatPreferensi(uid).questions,
  });
}

export async function generateBrowserPlanning() {
  throw new Error('Generator perangkat AI belum terhubung ke backend aktif.');
}

export async function startCanvaOAuth(uid) {
  requireUid(uid);
  return jalankanAiUserService('canva-oauth-start', {});
}
