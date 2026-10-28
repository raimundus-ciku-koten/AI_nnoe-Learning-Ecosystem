export const LOCAL_AI_MODELS = Object.freeze({
  'local-qwen': Object.freeze({
    id: 'Qwen2.5-7B-Instruct-q4f16_1-MLC',
    name: 'Qwen 2.5 7B Instruct · 4-bit',
    downloadSize: 'sekitar 4,5 GB',
    estimateVramMb: 5107,
    recommendation: 'Model utama untuk penalaran dan coding; perlu GPU/WebGPU dengan memori memadai.',
  }),
  'local-qwen-small': Object.freeze({
    id: 'Qwen2.5-1.5B-Instruct-q4f16_1-MLC',
    name: 'Qwen 2.5 1.5B Instruct · 4-bit',
    downloadSize: 'sekitar 1 GB',
    estimateVramMb: 1630,
    recommendation: 'Alternatif lebih ringan untuk perangkat dengan memori GPU terbatas.',
  }),
});

export function getRecommendedLocalAiModel(deviceMemory = globalThis.navigator?.deviceMemory) {
  return Number.isFinite(deviceMemory) && deviceMemory <= 4
    ? 'local-qwen-small'
    : 'local-qwen';
}

const SYSTEM_PROMPT = [
  'Anda adalah asisten profesional untuk ekosistem pembelajaran sekolah Indonesia.',
  'Gunakan bahasa Indonesia yang jelas, hangat, teliti, dan praktis.',
  'Jangan mengarang kurikulum, peraturan, sumber, atau fakta. Nyatakan asumsi bila informasi tidak tersedia.',
  'Untuk tugas pemrograman, berikan solusi yang dapat dijalankan, jelaskan asumsi penting, dan sertakan pengujian yang relevan.',
  'Untuk catatan rilis, gunakan judul dan bagian yang ringkas, konsisten, serta mudah dipindai.',
  'Lindungi privasi: jangan meminta nama lengkap, NISN, alamat, kredensial, atau data sensitif siswa.',
].join(' ');

let engine = null;
let aiWorker = null;
let loadedModel = '';
let loadPromise = null;
let activeModel = '';
let operationQueue = Promise.resolve();
let nextWorkerRequestId = 1;
let preparationGeneration = 0;
const pendingWorkerRequests = new Map();
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

function terminateWorker(error) {
  aiWorker?.terminate();
  aiWorker = null;
  engine = null;
  loadedModel = '';
  activeModel = '';
  if (error) {
    for (const request of pendingWorkerRequests.values()) request.reject(error);
  }
  pendingWorkerRequests.clear();
}

function toAbortError() {
  return new DOMException('Persiapan model dibatalkan.', 'AbortError');
}

function getAiWorker() {
  if (aiWorker) return aiWorker;
  const worker = new Worker(new URL('./localAi.worker.js', import.meta.url), {
    type: 'module',
  });
  worker.onmessage = ({ data }) => {
    if (data?.type === 'progress') {
      emitProgress(data.progress);
      return;
    }
    if (data?.type === 'preflight') {
      emitProgress({
        status: 'WebGPU tersedia di worker; kapasitas VRAM tidak dapat dipastikan oleh browser.',
        progress: null,
        model: activeModel,
        limits: data.limits,
      });
      return;
    }
    const request = pendingWorkerRequests.get(data?.id);
    if (!request) return;
    if (data.type === 'token') {
      request.onToken?.(data.token);
    } else if (data.type === 'error') {
      pendingWorkerRequests.delete(data.id);
      request.reject(new Error(data.message || 'Operasi AI lokal gagal.'));
    } else if (data.type === 'complete') {
      pendingWorkerRequests.delete(data.id);
      request.resolve();
    }
  };
  worker.onerror = (event) => {
    event.preventDefault();
    terminateWorker(new Error(event.message || 'Worker AI lokal berhenti tanpa menyelesaikan permintaan.'));
  };
  worker.onmessageerror = () => {
    terminateWorker(new Error('Respons worker AI lokal tidak dapat dibaca.'));
  };
  aiWorker = worker;
  return worker;
}

function requestWorker(type, payload = {}, { onToken } = {}) {
  const worker = getAiWorker();
  const id = nextWorkerRequestId++;
  return new Promise((resolve, reject) => {
    pendingWorkerRequests.set(id, { resolve, reject, onToken });
    try {
      worker.postMessage({ id, type, payload });
    } catch (error) {
      pendingWorkerRequests.delete(id);
      reject(error);
    }
  });
}

async function initializeModel(model, generation) {
  const entry = validateModel(model);
  try {
    if (!globalThis.isSecureContext) {
      throw new Error('WebGPU memerlukan koneksi aman (HTTPS) atau localhost.');
    }
    if (!globalThis.navigator?.gpu) {
      throw new Error('Browser ini belum menyediakan WebGPU. Gunakan Chrome atau Edge versi terbaru dengan akselerasi grafis aktif.');
    }
    const adapter = await globalThis.navigator.gpu.requestAdapter();
    if (generation !== preparationGeneration) throw toAbortError();
    if (!adapter) throw new Error('GPU WebGPU tidak tersedia. Perbarui browser atau aktifkan akselerasi grafis.');
    activeModel = model;
    emitProgress({ status: 'Memuat engine WebLLM…', progress: 0, model });
    await requestWorker('initialize', { id: entry.id, model });
    engine = true;
    loadedModel = model;
    emitProgress({ status: 'Model siap di perangkat ini.', progress: 1, model });
    return { model, modelName: entry.name };
  } catch (error) {
    if (generation === preparationGeneration) activeModel = loadedModel;
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
  const generation = ++preparationGeneration;
  const pending = serialize(() => initializeModel(model, generation));
  loadPromise = pending;
  activeModel = model;
  pending.finally(() => {
    if (loadPromise === pending) loadPromise = null;
  }).catch(() => {});
  return pending;
}

export function cancelLocalAiPreparation() {
  if (!loadPromise) return false;
  const model = activeModel;
  preparationGeneration += 1;
  terminateWorker(toAbortError());
  emitProgress({ status: 'Persiapan model dibatalkan.', progress: 0, model });
  return true;
}

export function unloadLocalAiModel() {
  return serialize(async () => {
    try {
      if (engine) await requestWorker('unload');
    } finally {
      terminateWorker();
      emitProgress({ status: 'Model lokal dilepas dari memori.', progress: 0, model: '' });
    }
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
    const abortGeneration = () => aiWorker?.postMessage({ type: 'interrupt' });
    signal?.addEventListener('abort', abortGeneration, { once: true });
    try {
      let answer = '';
      await requestWorker('generate', {
        messages: [
          { role: 'system', content: SYSTEM_PROMPT },
          ...messages,
        ],
        temperature,
        maxTokens,
      }, {
        onToken: (token) => {
          if (signal?.aborted) return;
          answer += token;
          onToken?.(token);
        },
      });
      if (signal?.aborted) throw new DOMException('Permintaan dibatalkan.', 'AbortError');
      const text = answer.trim();
      if (!text) throw new Error('Model lokal tidak menghasilkan jawaban. Coba ulang atau pilih model lain.');
      return { answer: text, model, modelName: LOCAL_AI_MODELS[model].name };
    } finally {
      signal?.removeEventListener('abort', abortGeneration);
    }
  });
}
