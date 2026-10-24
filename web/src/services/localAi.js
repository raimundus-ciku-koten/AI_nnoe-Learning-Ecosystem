export const LOCAL_AI_MODELS = Object.freeze({
  'local-qwen': Object.freeze({
    id: 'Qwen2.5-1.5B-Instruct-q4f16_1-MLC',
    name: 'Qwen 2.5 1.5B Instruct · 4-bit',
    estimateVramMb: 1630,
    recommendation: 'Model utama; kualitas dan kebutuhan perangkat lebih seimbang.',
  }),
  'local-llama': Object.freeze({
    id: 'Llama-3.2-3B-Instruct-q4f16_1-MLC',
    name: 'Llama 3.2 3B Instruct · 4-bit',
    estimateVramMb: 2264,
    recommendation: 'Opsi model lebih besar; lebih berat dan tidak cocok untuk banyak perangkat 2–4 GB.',
  }),
});

const SYSTEM_PROMPT = [
  'Anda adalah asisten profesional untuk ekosistem pembelajaran sekolah Indonesia.',
  'Gunakan bahasa Indonesia yang jelas, hangat, teliti, dan praktis.',
  'Jangan mengarang kurikulum, peraturan, sumber, atau fakta. Nyatakan asumsi bila informasi tidak tersedia.',
  'Lindungi privasi: jangan meminta nama lengkap, NISN, alamat, kredensial, atau data sensitif siswa.',
].join(' ');

let engine = null;
let loadedModel = '';
let loadPromise = null;
let activeModel = '';
let operationQueue = Promise.resolve();
const progressListeners = new Set();

function emitProgress(progress) {
  for (const listener of progressListeners) {
    try {
      listener(progress);
    } catch (error) {
      console.error('[local-ai] Progress listener gagal:', error);
    }
  }
}

function serialize(operation) {
  const result = operationQueue.then(operation);
  operationQueue = result.catch(() => {});
  return result;
}

function validateModel(model) {
  const entry = LOCAL_AI_MODELS[model];
  if (!entry) throw new TypeError('Model AI lokal tidak dikenal.');
  return entry;
}

async function initializeModel(model) {
  const entry = validateModel(model);
  try {
    if (!globalThis.isSecureContext) {
      throw new Error('WebGPU memerlukan koneksi aman (HTTPS) atau localhost.');
    }
    if (!globalThis.navigator?.gpu) {
      throw new Error('Browser ini belum menyediakan WebGPU. Gunakan Chrome atau Edge versi terbaru dengan akselerasi grafis aktif.');
    }
    const adapter = await globalThis.navigator.gpu.requestAdapter();
    if (!adapter) throw new Error('GPU WebGPU tidak tersedia. Perbarui browser atau aktifkan akselerasi grafis.');
    activeModel = model;
    emitProgress({ status: 'Memuat engine WebLLM…', progress: 0, model });
    const { CreateMLCEngine } = await import('@mlc-ai/web-llm');
    const config = {
      initProgressCallback: (report) => emitProgress({
        status: report.text || report.progress || 'Menyiapkan model lokal…',
        progress: Number.isFinite(report.progress) ? report.progress : null,
        model,
      }),
    };
    if (engine) await engine.reload(entry.id, config);
    else engine = await CreateMLCEngine(entry.id, config);
    loadedModel = model;
    emitProgress({ status: 'Model siap di perangkat ini.', progress: 1, model });
    return { model, modelName: entry.name };
  } catch (error) {
    activeModel = loadedModel;
    throw error;
  }
}

export function subscribeLocalAiProgress(listener) {
  if (typeof listener !== 'function') throw new TypeError('Listener progres harus berupa fungsi.');
  progressListeners.add(listener);
  return () => progressListeners.delete(listener);
}

export function getLocalAiStatus() {
  return {
    ready: Boolean(engine && loadedModel),
    model: loadedModel,
    loading: Boolean(loadPromise || activeModel && activeModel !== loadedModel),
  };
}

export function prepareLocalAiModel(model = 'local-qwen') {
  validateModel(model);
  if (loadedModel === model && engine) {
    return Promise.resolve({ model, modelName: LOCAL_AI_MODELS[model].name });
  }
  if (loadPromise && activeModel === model) return loadPromise;
  const pending = serialize(() => initializeModel(model));
  loadPromise = pending;
  activeModel = model;
  pending.finally(() => {
    if (loadPromise === pending) loadPromise = null;
  }).catch(() => {});
  return pending;
}

export function unloadLocalAiModel() {
  return serialize(async () => {
    if (engine && typeof engine.unload === 'function') await engine.unload();
    engine = null;
    loadedModel = '';
    activeModel = '';
    emitProgress({ status: 'Model lokal dilepas dari memori.', progress: 0, model: '' });
  });
}

export async function completeLocalAi(model, messages, {
  onToken,
  signal,
  maxTokens = 512,
  temperature = 0.35,
} = {}) {
  validateModel(model);
  if (!Array.isArray(messages) || !messages.length ||
      messages.some((message) =>
        !message || !['user', 'assistant'].includes(message.role) ||
        typeof message.content !== 'string')) {
    throw new TypeError('Percakapan AI lokal tidak valid.');
  }
  if (signal?.aborted) throw new DOMException('Permintaan dibatalkan.', 'AbortError');
  return serialize(async () => {
    if (loadedModel !== model || !engine) {
      throw new Error(`Siapkan ${LOCAL_AI_MODELS[model]?.name || 'model lokal'} terlebih dahulu di menu AI & Layanan. Pengunduhan tidak dimulai otomatis.`);
    }
    if (signal?.aborted) throw new DOMException('Permintaan dibatalkan.', 'AbortError');
    const stream = await engine.chat.completions.create({
      messages: [
        { role: 'system', content: SYSTEM_PROMPT },
        ...messages,
      ],
      stream: true,
      temperature,
      max_tokens: maxTokens,
    });
    let answer = '';
    for await (const chunk of stream) {
      if (signal?.aborted) throw new DOMException('Permintaan dibatalkan.', 'AbortError');
      const token = chunk.choices?.[0]?.delta?.content;
      if (typeof token === 'string' && token) {
        answer += token;
        onToken?.(token);
      }
    }
    const text = answer.trim();
    if (!text) throw new Error('Model lokal tidak menghasilkan jawaban. Coba ulang atau pilih model lain.');
    return { answer: text, model, modelName: LOCAL_AI_MODELS[model].name };
  });
}
