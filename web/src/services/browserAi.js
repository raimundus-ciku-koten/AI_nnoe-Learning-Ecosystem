import {
  completeLocalAi,
  getRecommendedLocalAiModel,
  LOCAL_AI_MODELS,
} from './localAi.js';

export const EXTERNAL_AI_PROVIDERS_ENABLED = true;

const PROVIDERS = Object.freeze({
  gemini: {
    name: 'Gemini',
    endpoint: 'https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent',
    model: 'gemini-2.5-flash',
  },
  deepseek: {
    name: 'DeepSeek',
    endpoint: 'https://api.deepseek.com/chat/completions',
    model: 'deepseek-chat',
  },
  groq: {
    name: 'Groq',
    endpoint: 'https://api.groq.com/openai/v1/chat/completions',
    model: 'llama-3.3-70b-versatile',
  },
});
const WORKFLOWS = Object.freeze(['planning', 'assistant', 'questions']);
const KEY_PATTERN = /^[A-Za-z0-9._\-]{12,4096}$/;
const PERSONAL_KEYS = new Map();

function defaultPreferences() {
  const model = getRecommendedLocalAiModel();
  return { planning: model, assistant: model, questions: model };
}

function validateUser(uid) {
  if (typeof uid !== 'string' || !uid.trim()) {
    throw new Error('Sesi login tidak tersedia. Masuk kembali.');
  }
  return uid;
}

function preferenceStorageKey(uid) {
  return `ale.ai.preferences.v1:${uid}`;
}

function readPreferences(uid) {
  const defaults = defaultPreferences();
  try {
    const value = JSON.parse(globalThis.localStorage?.getItem(preferenceStorageKey(uid)) || 'null');
    if (!value || typeof value !== 'object' || Array.isArray(value)) return defaults;
    return Object.fromEntries(WORKFLOWS.map((workflow) => [
      workflow,
      workflow === 'assistant' && !(value[workflow] in LOCAL_AI_MODELS)
        ? defaults[workflow]
        : workflow !== 'assistant' && !isSupportedProvider(value[workflow])
          ? defaults[workflow]
          : value[workflow],
    ]));
  } catch (error) {
    console.error('[browser-ai] Preferensi provider tidak dapat dibaca:', error);
    return defaults;
  }
}

function writePreferences(uid, preferences) {
  try {
    globalThis.localStorage?.setItem(preferenceStorageKey(uid), JSON.stringify(preferences));
  } catch (error) {
    throw new Error('Preferensi provider tidak dapat disimpan di browser ini.', { cause: error });
  }
}

function isSupportedProvider(provider) {
  return provider in PROVIDERS || provider in LOCAL_AI_MODELS;
}

function validateWorkflow(workflow) {
  if (!WORKFLOWS.includes(workflow)) throw new TypeError('Jenis penggunaan AI tidak dikenal.');
}

function resolveProvider(uid, workflow, mode = 'ai-nnoe') {
  validateWorkflow(workflow);
  const preference = readPreferences(uid)[workflow];
  if (workflow === 'assistant' || mode === 'ai-nnoe') {
    return preference in LOCAL_AI_MODELS ? preference : defaultPreferences()[workflow];
  }
  if (mode !== 'ai-eksternal') throw new TypeError('Pilihan mode AI tidak dikenal.');
  if (workflow === 'assistant') throw new Error('Chat hanya menggunakan AI_nnoe lokal.');
  const provider = preference;
  if (!isSupportedProvider(provider)) throw new Error('Pilihan model AI tidak tersedia.');
  if (provider in LOCAL_AI_MODELS) {
    throw new Error('Pilih provider API key di menu AI & Layanan sebelum menggunakan AI eksternal.');
  }
  if (provider in PROVIDERS && !PERSONAL_KEYS.get(uid)?.has(provider)) {
    throw new Error('API key provider pilihan ini tidak tersedia di memori sesi. Tambahkan kembali pada menu AI & Layanan.');
  }
  return provider;
}

function toChatMessages(messages) {
  if (!Array.isArray(messages) || !messages.length ||
      messages.some((message) => !message ||
        !['user', 'assistant'].includes(message.role) ||
        typeof message.text !== 'string' || !message.text.trim())) {
    throw new TypeError('Percakapan AI tidak valid.');
  }
  return messages.map(({ role, text }) => ({ role, content: text }));
}

async function requestPersonalProvider(uid, provider, messages, maxTokens) {
  const key = PERSONAL_KEYS.get(uid)?.get(provider);
  if (!key) throw new Error('API key provider belum tersedia di memori sesi.');
  const config = PROVIDERS[provider];
  const request = provider === 'gemini'
    ? {
      url: config.endpoint,
      headers: { 'Content-Type': 'application/json', 'x-goog-api-key': key },
      body: {
        systemInstruction: {
          parts: [{ text: 'Anda adalah asisten pembelajaran profesional berbahasa Indonesia. Jaga privasi siswa dan jangan mengarang fakta.' }],
        },
        contents: messages.map((message) => ({
          role: message.role === 'assistant' ? 'model' : 'user',
          parts: [{ text: message.content }],
        })),
        generationConfig: { maxOutputTokens: maxTokens, temperature: 0.35 },
      },
    }
    : {
      url: config.endpoint,
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${key}` },
      body: {
        model: config.model,
        messages: [
          { role: 'system', content: 'Anda adalah asisten pembelajaran profesional berbahasa Indonesia. Jaga privasi siswa dan jangan mengarang fakta.' },
          ...messages,
        ],
        max_tokens: maxTokens,
        temperature: 0.35,
      },
    };

  let response;
  try {
    response = await fetch(request.url, {
      method: 'POST',
      headers: request.headers,
      body: JSON.stringify(request.body),
      signal: AbortSignal.timeout(60000),
    });
  } catch {
    throw new Error(`Koneksi ke ${config.name} gagal. Periksa jaringan dan pengaturan CORS provider.`);
  }
  let result;
  try {
    result = await response.json();
  } catch {
    throw new Error(`Respons ${config.name} tidak dapat dibaca.`);
  }
  if (!response.ok) {
    const error = new Error(
      typeof result.error?.message === 'string'
        ? `${config.name}: ${result.error.message.slice(0, 300)}`
        : `Permintaan ${config.name} gagal (HTTP ${response.status}).`,
    );
    error.status = response.status;
    throw error;
  }
  const answer = provider === 'gemini'
    ? result.candidates?.[0]?.content?.parts?.map((part) => part.text || '').join('')
    : result.choices?.[0]?.message?.content;
  if (typeof answer !== 'string' || !answer.trim()) {
    throw new Error(`${config.name} tidak menghasilkan jawaban yang dapat digunakan.`);
  }
  return { answer: answer.trim(), penyedia: provider };
}

async function complete(uid, workflow, messages, {
  maxTokens = 512,
  signal,
  onToken,
  mode = 'ai-nnoe',
  externalAcknowledged = false,
} = {}) {
  const userId = validateUser(uid);
  const provider = resolveProvider(userId, workflow, mode);
  if (provider in PROVIDERS && !externalAcknowledged) {
    throw new Error('Konfirmasi penggunaan AI eksternal sebelum mengirim prompt ke provider.');
  }
  const normalized = toChatMessages(messages);
  if (provider in LOCAL_AI_MODELS) {
    const result = await completeLocalAi(provider, normalized, { maxTokens, signal, onToken });
    return { answer: result.answer, penyedia: provider, modelName: result.modelName };
  }
  const result = await requestPersonalProvider(userId, provider, normalized, maxTokens);
  onToken?.(result.answer);
  return result;
}

export function getBrowserAiConnections(uid) {
  const userId = validateUser(uid);
  const userKeys = PERSONAL_KEYS.get(userId);
  return {
    providers: Object.fromEntries(Object.keys(PROVIDERS).map((provider) => [
      provider,
      {
        personal: Boolean(userKeys?.has(provider)),
        platform: false,
        available: Boolean(userKeys?.has(provider)),
      },
    ])),
    preferences: readPreferences(userId),
    personalKeysEnabled: true,
  };
}

export async function testAndSaveBrowserKey(uid, provider, apiKey) {
  const userId = validateUser(uid);
  if (!(provider in PROVIDERS)) throw new TypeError('Provider API key tidak didukung.');
  const key = typeof apiKey === 'string' ? apiKey.trim() : '';
  if (!KEY_PATTERN.test(key)) {
    throw new TypeError('Format API key tidak valid. Periksa kembali key dari portal resmi provider.');
  }
  let userKeys = PERSONAL_KEYS.get(userId);
  if (!userKeys) {
    userKeys = new Map();
    PERSONAL_KEYS.set(userId, userKeys);
  }
  userKeys.set(provider, key);
  return { provider, personal: true, storage: 'memory-only' };
}

export function removeBrowserKey(uid, provider) {
  const userId = validateUser(uid);
  if (!(provider in PROVIDERS)) throw new TypeError('Provider API key tidak didukung.');
  PERSONAL_KEYS.get(userId)?.delete(provider);
  const preferences = readPreferences(userId);
  const defaults = defaultPreferences();
  for (const workflow of WORKFLOWS) {
    if (preferences[workflow] === provider) preferences[workflow] = defaults[workflow];
  }
  writePreferences(userId, preferences);
}

export function clearBrowserAiSession(uid) {
  if (uid) {
    PERSONAL_KEYS.delete(uid);
    try {
      globalThis.localStorage?.removeItem(preferenceStorageKey(uid));
    } catch (error) {
      console.error('[browser-ai] Preferensi sesi AI tidak dapat dibersihkan:', error);
    }
    return;
  }
  PERSONAL_KEYS.clear();
}

export function setBrowserAiPreference(uid, workflow, provider) {
  const userId = validateUser(uid);
  validateWorkflow(workflow);
  if (!isSupportedProvider(provider)) throw new TypeError('Model atau provider AI tidak dikenal.');
  if (workflow === 'assistant' && !(provider in LOCAL_AI_MODELS)) {
    throw new Error('Chat hanya menggunakan model AI_nnoe lokal.');
  }
  if (provider in PROVIDERS && !PERSONAL_KEYS.get(userId)?.has(provider)) {
    throw new Error('Tambahkan API key provider terlebih dahulu pada sesi ini.');
  }
  const preferences = readPreferences(userId);
  preferences[workflow] = provider;
  writePreferences(userId, preferences);
  return preferences;
}

function makeQuestionPrompt({ mapel, kelas, topik, jenis }) {
  const subject = String(mapel || '').trim().slice(0, 120);
  const grade = String(kelas || '').trim().slice(0, 80);
  const topic = String(topik || '').trim().slice(0, 500);
  const type = String(jenis || 'pilihan_ganda').trim().slice(0, 50);
  if (!subject || !grade || !topic) {
    throw new TypeError('Isi mata pelajaran, kelas, dan topik sebelum membuat draf soal.');
  }
  return [
    'Buat satu draf soal yang sesuai konteks berikut.',
    `Mata pelajaran: ${subject}.`,
    `Kelas: ${grade}.`,
    `Topik: ${topic}.`,
    `Jenis soal: ${type}.`,
    'Jawab hanya dengan satu objek JSON valid tanpa markdown, dengan properti pertanyaan (string), pilihan (array string; kosong untuk uraian), jawaban (string), pembahasan (string).',
  ].join(' ');
}

function parseQuestionPayload(text) {
  const json = text.trim().replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '');
  let question;
  try {
    question = JSON.parse(json);
  } catch (cause) {
    throw new Error('Draf AI tidak mengikuti format soal. Coba lagi atau pilih model lain.', { cause });
  }
  if (!question || typeof question.pertanyaan !== 'string' ||
      typeof question.jawaban !== 'string' || typeof question.pembahasan !== 'string' ||
      !Array.isArray(question.pilihan) ||
      question.pilihan.some((choice) => typeof choice !== 'string')) {
    throw new Error('Struktur draf soal AI tidak lengkap.');
  }
  return { questions: [question] };
}

export async function generateBrowserQuestion(uid, input, {
  mode = 'ai-nnoe',
  externalAcknowledged = false,
} = {}) {
  const result = await complete(uid, 'questions', [{
    role: 'user',
    text: makeQuestionPrompt(input),
  }], { maxTokens: 700, mode, externalAcknowledged });
  return {
    ...result,
    payload: parseQuestionPayload(result.answer),
  };
}

export async function askBrowserAssistant(uid, messages, options = {}) {
  const result = await complete(uid, 'assistant', messages, {
    maxTokens: 700,
    ...options,
    mode: 'ai-nnoe',
    externalAcknowledged: false,
  });
  return { ...result, answer: result.answer };
}

export async function generateBrowserPlanning({
  uid,
  paketId,
  jenis,
  noUnit,
  prompt,
  maxTokens = 900,
  sinyal,
  mode = 'ai-nnoe',
  externalAcknowledged = false,
}) {
  const planningType = String(jenis || '');
  if (!['atp', 'kktp', 'modul'].includes(planningType)) {
    throw new TypeError('Jenis dokumen perencanaan AI tidak didukung.');
  }
  if (typeof paketId !== 'string' || !paketId.trim()) {
    throw new TypeError('Paket perencanaan tidak tersedia.');
  }
  if (!Number.isInteger(maxTokens) || maxTokens < 1 || maxTokens > 4096) {
    throw new TypeError('Batas token draf perencanaan tidak valid.');
  }
  if (prompt !== undefined &&
      (typeof prompt !== 'string' || !prompt.trim() || prompt.length > 60_000)) {
    throw new TypeError('Prompt perencanaan kosong atau melebihi batas aman 60.000 karakter.');
  }
  const result = await complete(uid, 'planning', [{
    role: 'user',
    text: prompt?.trim() ?? [
      `Buat draf ${planningType.toUpperCase()} untuk perangkat pembelajaran sekolah Indonesia.`,
      `ID paket aktif: ${paketId.slice(0, 100)}.`,
      Number.isInteger(noUnit) ? `Nomor unit: ${noUnit}.` : '',
      'Susun hasil yang mudah diperiksa dan disunting guru. Gunakan bagian, tabel markdown bila membantu, dan placeholder yang jelas untuk informasi mata pelajaran/kelas yang belum tersedia.',
      'Jangan membuat klaim bahwa draf ini telah disesuaikan dengan dokumen yang tidak Anda terima.',
    ].filter(Boolean).join(' '),
  }], { maxTokens, signal: sinyal, mode, externalAcknowledged });
  return { ...result, jenis: planningType, paketId };
}
