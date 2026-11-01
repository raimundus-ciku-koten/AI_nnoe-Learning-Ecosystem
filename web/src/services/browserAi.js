import { routeAiRequest } from './aiProviders.js';
import { bacaInputAi } from './planningDriveRepository.js';
import { parsePlanningOutput } from './planningAiSchema.js';
import { kontrakKodeAtp, promptAtp } from './planningAiPrompts.js';

export const EXTERNAL_AI_PROVIDERS_ENABLED = false;

const PROVIDERS = ['gemini', 'deepseek', 'groq'];
const WORKFLOWS = ['planning', 'assistant', 'questions'];
const AI_DISABLED_MESSAGE = 'Provider AI eksternal dinonaktifkan untuk mencegah biaya atau billing yang tidak disengaja.';

function requireUser(uid) {
  if (!uid) throw new Error('Sesi login tidak tersedia. Masuk kembali.');
}

export function getBrowserAiConnections(uid) {
  requireUser(uid);
  return {
    providers: Object.fromEntries(PROVIDERS.map((provider) => [
      provider,
      { personal: false, platform: false, available: false },
    ])),
    preferences: Object.fromEntries(WORKFLOWS.map((workflow) => [workflow, 'local'])),
    personalKeysEnabled: false,
  };
}

export async function testAndSaveBrowserKey() {
  throw new Error(AI_DISABLED_MESSAGE);
}

export function removeBrowserKey() {
  throw new Error(AI_DISABLED_MESSAGE);
}

export function clearBrowserAiSession() {}

export function setBrowserAiPreference() {
  throw new Error(AI_DISABLED_MESSAGE);
}

function parseJsonResponse(raw, label) {
  const cleaned = String(raw || '').replace(/^```(?:json)?\s*|\s*```$/g, '').trim();
  try {
    return JSON.parse(cleaned);
  } catch {
    throw new Error(`${label} tidak mengembalikan JSON valid.`);
  }
}

export async function generateBrowserQuestion(uid, input = {}) {
  requireUser(uid);
  if (!input || typeof input !== 'object' || Array.isArray(input)) {
    throw new TypeError('Input generator soal tidak valid.');
  }
  const requiredText = (value, label, maxLength) => {
    if (typeof value !== 'string') throw new TypeError(`${label} wajib berupa teks.`);
    const text = value.trim();
    if (!text) throw new TypeError(`${label} wajib diisi.`);
    if (text.length > maxLength) throw new RangeError(`${label} maksimal ${maxLength} karakter.`);
    return text;
  };
  const mapel = requiredText(input.mapel, 'Mata pelajaran', 80);
  const kelas = requiredText(input.kelas, 'Kelas/fase', 30);
  const topik = requiredText(input.topik, 'Topik', 500);
  const jenisInput = requiredText(input.jenis, 'Jenis soal', 40).toLocaleLowerCase('id');
  const jenis = ['pilihan_ganda', 'pilihan ganda'].includes(jenisInput)
    ? 'pilihan_ganda'
    : jenisInput === 'uraian' ? 'uraian' : '';
  if (!jenis) {
    throw new TypeError('Jenis soal harus berupa pilihan ganda atau uraian.');
  }
  const result = await routeAiRequest({
    uid,
    workflow: 'questions',
    prompt: [
      'Buat tepat satu draf soal pendidikan berbahasa Indonesia dan sesuai topik.',
      'Kembalikan hanya JSON: {"questions":[{"pertanyaan":"...","pilihan":["...","...","...","..."],"jawaban":"...","pembahasan":"..."}]}.',
      'Pilihan ganda wajib memiliki tepat empat pilihan berbeda berurutan A-D dan jawaban harus sama persis dengan salah satunya.',
      'Untuk soal uraian, pilihan wajib berupa array kosong dan jawaban berisi pedoman penilaian.',
      'Pertanyaan, jawaban, dan pembahasan wajib terisi. Jangan sertakan data pribadi.',
      JSON.stringify({ mapel, kelas, topik, jenis }),
    ].join('\n'),
    validateResponse: (raw) => {
      if (typeof raw !== 'string' || raw.length > 20000) {
        throw new Error('Respons soal terlalu panjang atau tidak berupa teks.');
      }
      const payload = parseJsonResponse(raw, 'AI_nnoe lokal');
      if (!Array.isArray(payload?.questions) || payload.questions.length !== 1) {
        throw new Error('Draf harus berisi tepat satu soal.');
      }
      const question = payload.questions[0];
      const validText = (value, maxLength) =>
        typeof value === 'string' && value.trim().length > 0 && value.trim().length <= maxLength;
      if (!validText(question?.pertanyaan, 2000) ||
          !validText(question?.jawaban, 1000) ||
          !validText(question?.pembahasan, 2000) ||
          !Array.isArray(question?.pilihan) ||
          question.pilihan.some((choice) => !validText(choice, 300))) {
        throw new Error('Teks soal, jawaban, pembahasan, atau pilihan tidak lengkap.');
      }
      const pilihan = question.pilihan.map((choice) => choice.trim());
      const jawaban = question.jawaban.trim();
      if (jenis === 'pilihan_ganda' &&
          (pilihan.length !== 4 || new Set(pilihan).size !== 4 || !pilihan.includes(jawaban))) {
        throw new Error('Pilihan ganda harus berisi empat pilihan unik dan kunci yang cocok.');
      }
      if (jenis === 'uraian' && pilihan.length !== 0) {
        throw new Error('Soal uraian tidak boleh memiliki pilihan ganda.');
      }
      return {
        pertanyaan: question.pertanyaan.trim(),
        pilihan,
        jawaban,
        pembahasan: question.pembahasan.trim(),
      };
    },
  });
  return {
    payload: { questions: [result.validated] },
    penyedia: result.provider,
    model: result.model,
    fallbackUsed: Boolean(result.fallbackUsed),
  };
}

export async function askBrowserAssistant(uid, messages = []) {
  requireUser(uid);
  if (!Array.isArray(messages) || !messages.length) throw new TypeError('Percakapan belum memiliki pesan.');
  const transcript = messages.slice(-16).map((message) => {
    if (!['user', 'assistant'].includes(message?.role) || typeof message.text !== 'string') {
      throw new TypeError('Format pesan asisten tidak valid.');
    }
    return `${message.role === 'user' ? 'Pengguna' : 'Asisten'}: ${message.text.slice(0, 3000)}`;
  }).join('\n');
  const result = await routeAiRequest({
    uid,
    workflow: 'assistant',
    prompt: `Jawab percakapan berikut dengan akurat, ringkas, dan berbahasa Indonesia. Jangan mengarang fakta.\n\n${transcript}`,
  });
  return { answer: result.text, penyedia: result.provider };
}

export async function generateBrowserPlanning({ uid, paketId, jenis, noUnit, sinyal } = {}) {
  requireUser(uid);
  if (sinyal?.aborted) throw new DOMException('Permintaan dibatalkan.', 'AbortError');
  const context = await bacaInputAi({ uid, paketId, jenis, noUnit });
  const requiredShape = jenis === 'kktp'
      ? '{"ambang":75,"items":[{"kode":"...","indikator":["..."],"rubrik":{"perluBimbingan":"...","cukup":"...","baik":"...","sangatBaik":"..."}}]}'
      : '{"tujuanKode":["..."],"model":"...","pemahamanBermakna":["..."],"pertanyaanPemantik":["..."],"dimensiProfil":["..."],"sarpras":["..."],"pertemuan":[{"ke":1,"judul":"...","tujuan":"...","menit":40,"pendahuluan":["..."],"inti":["..."],"penutup":["..."]}],"asesmen":{"diagnostik":"...","formatif":"...","sumatif":"..."},"remedial":"...","pengayaan":"...","refleksiGuru":["..."],"refleksiSiswa":["..."]}';
  const kontrakAtp = jenis === 'atp' ? kontrakKodeAtp(context) : null;
  const prompt = jenis === 'atp'
    ? promptAtp(context)
    : [
      `Susun draf ${jenis} untuk perencanaan pembelajaran.`,
      'Ikuti struktur JSON yang diwajibkan dan jangan menambah properti.',
      'Jangan mengarang, mengubah, atau memparafrase teks CP dan kode TP pada input.',
      'Kembalikan hanya objek JSON; seluruh teks berbahasa Indonesia.',
      `Struktur: ${requiredShape}`,
      `Konteks sumber: ${JSON.stringify(context)}`,
    ].join('\n');
  const result = await routeAiRequest({
    uid,
    workflow: 'planning',
    signal: sinyal,
    prompt,
  });
  const parsed = parsePlanningOutput(jenis, result.text, {
    cp: context.cp,
    ...(jenis === 'atp' ? {
      legacyContract: true,
      requireAtpDetails: true,
      jpPerPekan: context.jpPerPekan,
      kodeTp: kontrakAtp.flatMap((item) => item.kode),
    } : { kodeTp: context.kodeTp }),
  });
  return { payload: parsed, penyedia: result.provider };
}
