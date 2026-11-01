import { supabase } from '../lib/supabase.ts';

const LOCAL_SETTINGS_KEY = 'ainnoe.ai.local.settings.v1';
const DEFAULT_LOCAL_SETTINGS = Object.freeze({
  endpoint: import.meta.env?.VITE_LOCAL_AI_ENDPOINT?.trim() || 'http://127.0.0.1:11434',
  model: import.meta.env?.VITE_LOCAL_AI_MODEL?.trim() || 'llama3.2',
  timeoutSeconds: 120,
  outputTokens: -1,
});
const WORKFLOWS = new Set(['planning', 'assistant', 'questions']);

function validasiPengaturanLokal(settings) {
  if (!settings || typeof settings !== 'object' || Array.isArray(settings)) {
    throw new TypeError('Pengaturan AI_nnoe lokal tidak valid.');
  }
  const endpointText = String(settings.endpoint ?? '').trim();
  const model = String(settings.model ?? '').trim();
  const timeoutSeconds = Number(settings.timeoutSeconds);
  const outputTokens = Number(settings.outputTokens);
  localEndpoint(endpointText);
  if (!model || model.length > 100 || !/^[\w][\w.:-]*$/.test(model)) {
    throw new TypeError('Nama model AI_nnoe hanya boleh berisi huruf, angka, titik, garis bawah, titik dua, atau tanda hubung.');
  }
  if (!Number.isInteger(timeoutSeconds) || timeoutSeconds < 15 || timeoutSeconds > 600) {
    throw new RangeError('Batas waktu AI_nnoe harus 15–600 detik.');
  }
  if (!Number.isSafeInteger(outputTokens) ||
      (outputTokens !== -1 && outputTokens < 128)) {
    throw new RangeError('Batas keluaran harus -1 (tanpa batas keluaran aplikasi) atau bilangan bulat minimal 128 token.');
  }
  return { endpoint: endpointText, model, timeoutSeconds, outputTokens };
}

export function muatPengaturanLokalAI() {
  const stored = globalThis.localStorage?.getItem(LOCAL_SETTINGS_KEY);
  if (!stored) return { ...DEFAULT_LOCAL_SETTINGS };
  let settings;
  try {
    settings = JSON.parse(stored);
  } catch {
    throw new Error('Pengaturan AI_nnoe lokal tersimpan rusak. Atur ulang atau simpan kembali pengaturan lokal.');
  }
  return validasiPengaturanLokal(settings);
}

export function simpanPengaturanLokalAI(settings) {
  const validated = validasiPengaturanLokal(settings);
  if (!globalThis.localStorage) throw new Error('Penyimpanan lokal browser tidak tersedia.');
  globalThis.localStorage.setItem(LOCAL_SETTINGS_KEY, JSON.stringify(validated));
  return validated;
}

export function aturUlangPengaturanLokalAI() {
  if (!globalThis.localStorage) throw new Error('Penyimpanan lokal browser tidak tersedia.');
  globalThis.localStorage.removeItem(LOCAL_SETTINGS_KEY);
  return { ...DEFAULT_LOCAL_SETTINGS };
}

function localEndpoint(endpointValue) {
  let endpoint;
  try {
    endpoint = new URL(endpointValue);
  } catch {
    throw new Error('Endpoint AI lokal tidak valid.');
  }
  if (!['http:', 'https:'].includes(endpoint.protocol) ||
      !['localhost', '127.0.0.1', '[::1]'].includes(endpoint.hostname) ||
      endpoint.username || endpoint.password) {
    throw new Error('AI_nnoe hanya boleh terhubung ke endpoint localhost.');
  }
  return endpoint;
}

async function askLocal(prompt, workflow, requestSignal) {
  const settings = muatPengaturanLokalAI();
  const endpoint = localEndpoint(settings.endpoint);
  endpoint.pathname = `${endpoint.pathname.replace(/\/$/, '')}/api/chat`;
  const signal = requestSignal
    ? AbortSignal.any([AbortSignal.timeout(settings.timeoutSeconds * 1000), requestSignal])
    : AbortSignal.timeout(settings.timeoutSeconds * 1000);
  const response = await fetch(endpoint, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model: settings.model,
      stream: false,
      messages: [{ role: 'user', content: prompt }],
      options: { num_predict: settings.outputTokens },
      metadata: { workflow, product: 'AI_nnoe' },
    }),
    signal,
  });
  const result = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(`AI_nnoe lokal merespons HTTP ${response.status}.`);
  const text = result?.message?.content;
  if (typeof text !== 'string' || !text.trim()) throw new Error('AI_nnoe lokal mengembalikan hasil kosong.');
  return { text, provider: 'local', model: result.model || settings.model };
}

async function askCloud(prompt, workflow, allowCloud, sensitivity, requestSignal) {
  if (allowCloud !== true) throw new Error('Pengiriman prompt ke AI cloud memerlukan persetujuan eksplisit.');
  if (sensitivity !== 'non_sensitive') throw new Error('Data sensitif hanya dapat diproses dengan AI_nnoe lokal.');
  const { data, error } = await supabase.auth.getSession();
  if (error) throw error;
  const accessToken = data.session?.access_token;
  if (!accessToken) throw new Error('Sesi login berakhir. Silakan masuk kembali.');
  const response = await fetch('/api/ai', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${accessToken}`,
    },
    credentials: 'same-origin',
    body: JSON.stringify({ workflow, prompt, allowCloud: true, sensitivity }),
    signal: requestSignal
      ? AbortSignal.any([AbortSignal.timeout(35000), requestSignal])
      : AbortSignal.timeout(35000),
  });
  const result = await response.json().catch(() => ({}));
  if (!response.ok) {
    const error = new Error(result.error || 'AI cloud tidak dapat memproses permintaan.');
    error.code = result.code || 'cloud_ai_failed';
    throw error;
  }
  return result;
}

export const localAiProvider = Object.freeze({
  id: 'local',
  label: 'AI_nnoe',
  generate: askLocal,
});

export const cloudAiProvider = Object.freeze({
  id: 'cloud',
  label: 'AI cloud',
  generate: askCloud,
});

export async function routeAiRequest({
  workflow,
  prompt,
  preference = 'local',
  sensitivity = 'sensitive',
  allowCloud = false,
  signal,
}) {
  if (!WORKFLOWS.has(workflow)) throw new TypeError('Workflow AI tidak dikenal.');
  if (typeof prompt !== 'string' || !prompt.trim()) throw new TypeError('Prompt AI wajib diisi.');
  if (!['local', 'cloud'].includes(preference)) throw new TypeError('Preferensi AI tidak valid.');

  if (preference === 'cloud') {
    if (allowCloud !== true) throw new Error('Aktifkan persetujuan cloud untuk permintaan ini.');
    if (sensitivity !== 'non_sensitive') throw new Error('Data sensitif hanya dapat diproses dengan AI_nnoe lokal.');
    try {
      return await cloudAiProvider.generate(prompt, workflow, allowCloud, sensitivity, signal);
    } catch (error) {
      if (globalThis.navigator?.onLine !== false) throw error;
      return localAiProvider.generate(prompt, workflow, signal);
    }
  }
  try {
    return await localAiProvider.generate(prompt, workflow, signal);
  } catch (localError) {
    if (allowCloud === true && sensitivity === 'non_sensitive') {
      try {
        return await cloudAiProvider.generate(prompt, workflow, allowCloud, sensitivity, signal);
      } catch (cloudError) {
        cloudError.cause = localError;
        throw cloudError;
      }
    }
    throw localError;
  }
}
