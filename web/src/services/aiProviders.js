const LOCAL_SETTINGS_KEY = 'ainnoe.ai.local.settings.v2';
const DEFAULT_PRIMARY_MODEL = import.meta.env?.VITE_LOCAL_AI_MODEL?.trim() || 'llama3.2:3b';
const DEFAULT_FALLBACK_MODEL = import.meta.env?.VITE_LOCAL_AI_FALLBACK_MODEL?.trim()
  || (DEFAULT_PRIMARY_MODEL === 'llama3.2:1b' ? 'llama3.2:3b' : 'llama3.2:1b');
const DEFAULT_LOCAL_SETTINGS = Object.freeze({
  endpoint: import.meta.env?.VITE_LOCAL_AI_ENDPOINT?.trim() || 'http://127.0.0.1:11434',
  model: DEFAULT_PRIMARY_MODEL,
  fallbackModel: DEFAULT_FALLBACK_MODEL,
  timeoutSeconds: 120,
  outputTokens: -1,
});
const WORKFLOWS = new Set(['planning', 'assistant', 'questions', 'modul_siswa']);
const FALLBACK_WORKFLOWS = Object.freeze({
  questions: 'Bank Soal',
  modul_siswa: 'Modul Siswa',
});

function requireUser(uid) {
  const userId = String(uid || '').trim();
  if (!userId || userId.length > 200) {
    throw new Error('Sesi login tidak tersedia. Masuk kembali untuk menggunakan AI_nnoe lokal.');
  }
  return userId;
}

function storageKey(uid) {
  return `${LOCAL_SETTINGS_KEY}:${encodeURIComponent(requireUser(uid))}`;
}

function validasiPengaturanLokal(settings) {
  if (!settings || typeof settings !== 'object' || Array.isArray(settings)) {
    throw new TypeError('Pengaturan AI_nnoe lokal tidak valid.');
  }
  const endpointText = String(settings.endpoint ?? '').trim();
  const model = String(settings.model ?? '').trim();
  const fallbackModel = String(settings.fallbackModel ?? DEFAULT_LOCAL_SETTINGS.fallbackModel).trim();
  const timeoutSeconds = Number(settings.timeoutSeconds);
  const outputTokens = Number(settings.outputTokens);
  localEndpoint(endpointText);
  if (!model || model.length > 100 || !/^[\w][\w.:-]*$/.test(model)) {
    throw new TypeError('Nama model AI_nnoe hanya boleh berisi huruf, angka, titik, garis bawah, titik dua, atau tanda hubung.');
  }
  if (!fallbackModel || fallbackModel.length > 100 || !/^[\w][\w.:-]*$/.test(fallbackModel)) {
    throw new TypeError('Nama model cadangan AI_nnoe hanya boleh berisi huruf, angka, titik, garis bawah, titik dua, atau tanda hubung.');
  }
  if (fallbackModel === model) {
    throw new TypeError('Model cadangan Bank Soal harus berbeda dari model utama.');
  }
  if (!Number.isInteger(timeoutSeconds) || timeoutSeconds < 15 || timeoutSeconds > 600) {
    throw new RangeError('Batas waktu AI_nnoe harus 15–600 detik.');
  }
  if (!Number.isSafeInteger(outputTokens) ||
      (outputTokens !== -1 && outputTokens < 128)) {
    throw new RangeError('Batas keluaran harus -1 (tanpa batas keluaran aplikasi) atau bilangan bulat minimal 128 token.');
  }
  return { endpoint: endpointText, model, fallbackModel, timeoutSeconds, outputTokens };
}

export function muatPengaturanLokalAI(uid) {
  const stored = globalThis.localStorage?.getItem(storageKey(uid));
  if (!stored) return { ...DEFAULT_LOCAL_SETTINGS };
  let settings;
  try {
    settings = JSON.parse(stored);
  } catch {
    throw new Error('Pengaturan AI_nnoe lokal tersimpan rusak. Atur ulang atau simpan kembali pengaturan lokal.');
  }
  return validasiPengaturanLokal(settings);
}

export function simpanPengaturanLokalAI(uid, settings) {
  const validated = validasiPengaturanLokal(settings);
  if (!globalThis.localStorage) throw new Error('Penyimpanan lokal browser tidak tersedia.');
  globalThis.localStorage.setItem(storageKey(uid), JSON.stringify(validated));
  return validated;
}

export function aturUlangPengaturanLokalAI(uid) {
  if (!globalThis.localStorage) throw new Error('Penyimpanan lokal browser tidak tersedia.');
  globalThis.localStorage.removeItem(storageKey(uid));
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

async function askLocal(settings, prompt, workflow, requestSignal, model) {
  const endpoint = localEndpoint(settings.endpoint);
  endpoint.pathname = `${endpoint.pathname.replace(/\/$/, '')}/api/chat`;
  const signal = requestSignal
    ? AbortSignal.any([AbortSignal.timeout(settings.timeoutSeconds * 1000), requestSignal])
    : AbortSignal.timeout(settings.timeoutSeconds * 1000);
  let response;
  try {
    response = await fetch(endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model,
        stream: false,
        messages: [{ role: 'user', content: prompt }],
        options: { num_predict: settings.outputTokens },
        metadata: { workflow, product: 'AI_nnoe' },
      }),
      signal,
    });
  } catch (cause) {
    if (requestSignal?.aborted) throw cause;
    if (cause?.name === 'TimeoutError' || signal.aborted) {
      throw new Error(`AI_nnoe lokal tidak merespons dalam ${settings.timeoutSeconds} detik. Coba lagi atau periksa model lokal.`);
    }
    throw new Error('AI_nnoe lokal tidak dapat dijangkau. Pastikan Ollama berjalan dan origin aplikasi diizinkan pada CORS.');
  }
  const result = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(`AI_nnoe lokal merespons HTTP ${response.status}.`);
  const text = result?.message?.content;
  if (typeof text !== 'string' || !text.trim()) throw new Error('AI_nnoe lokal mengembalikan hasil kosong.');
  return { text, provider: 'local', model: result.model || model };
}

function validateLocalResult(result, validateResponse) {
  if (!validateResponse) return result;
  try {
    return { ...result, validated: validateResponse(result.text) };
  } catch (cause) {
    throw new Error(`Model lokal ${result.model} mengembalikan hasil yang tidak sesuai format.`, { cause });
  }
}

export async function routeAiRequest({ uid, workflow, prompt, signal, validateResponse }) {
  const userId = requireUser(uid);
  if (!WORKFLOWS.has(workflow)) throw new TypeError('Workflow AI tidak dikenal.');
  if (typeof prompt !== 'string' || !prompt.trim()) throw new TypeError('Prompt AI wajib diisi.');
  if (validateResponse !== undefined && typeof validateResponse !== 'function') {
    throw new TypeError('Validator hasil AI tidak valid.');
  }
  const settings = muatPengaturanLokalAI(userId);
  try {
    const result = await askLocal(settings, prompt, workflow, signal, settings.model);
    return validateLocalResult(result, validateResponse);
  } catch (primaryError) {
    const fallbackLabel = FALLBACK_WORKFLOWS[workflow];
    if (signal?.aborted || !fallbackLabel || !settings.fallbackModel) throw primaryError;
    try {
      const result = await askLocal(settings, prompt, workflow, signal, settings.fallbackModel);
      return {
        ...validateLocalResult(result, validateResponse),
        fallbackUsed: true,
      };
    } catch (fallbackError) {
      if (signal?.aborted) throw fallbackError;
      const message = (error) => error instanceof Error ? error.message : 'Kesalahan tidak diketahui.';
      throw new Error(
        `Model utama gagal: ${message(primaryError)} Model cadangan ${fallbackLabel} juga gagal: ${message(fallbackError)}. Periksa model lokal atau coba kembali.`,
        { cause: fallbackError },
      );
    }
  }
}
