import { routeAiRequest } from './aiProviders.js';
import { bacaInputAi } from '../pages/perencanaan/services/planningDriveRepository.js';
import { parsePlanningOutput } from './planningAiSchema.js';

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
  const mapel = String(input.mapel || '').trim();
  const kelas = String(input.kelas || '').trim();
  const topik = String(input.topik || '').trim();
  const jenis = String(input.jenis || '').trim();
  if (!mapel || !kelas || !topik || !jenis) {
    throw new TypeError('Mata pelajaran, kelas, topik, dan jenis soal wajib diisi.');
  }
  const result = await routeAiRequest({
    workflow: 'questions',
    sensitivity: 'sensitive',
    prompt: [
      'Buat tepat satu draf soal pendidikan berbahasa Indonesia.',
      'Kembalikan hanya JSON: {"questions":[{"pertanyaan":"...","pilihan":["A...","B...","C...","D..."],"jawaban":"...","pembahasan":"..."}]}.',
      'Untuk soal uraian, pilihan boleh berupa array kosong. Jangan sertakan data pribadi.',
      JSON.stringify({ mapel, kelas, topik, jenis }),
    ].join('\n'),
  });
  const payload = parseJsonResponse(result.text, 'AI lokal');
  const question = payload?.questions?.[0];
  if (!question || typeof question.pertanyaan !== 'string' ||
      typeof question.jawaban !== 'string' || typeof question.pembahasan !== 'string' ||
      !Array.isArray(question.pilihan) ||
      question.pilihan.some((choice) => typeof choice !== 'string')) {
    throw new Error('AI lokal mengembalikan struktur draf soal yang tidak sesuai.');
  }
  return { payload: { questions: [question] }, penyedia: result.provider };
}

export async function askBrowserAssistant(uid, messages = [], { allowCloud = false } = {}) {
  requireUser(uid);
  if (!Array.isArray(messages) || !messages.length) throw new TypeError('Percakapan belum memiliki pesan.');
  const transcript = messages.slice(-16).map((message) => {
    if (!['user', 'assistant'].includes(message?.role) || typeof message.text !== 'string') {
      throw new TypeError('Format pesan asisten tidak valid.');
    }
    return `${message.role === 'user' ? 'Pengguna' : 'Asisten'}: ${message.text.slice(0, 3000)}`;
  }).join('\n');
  const result = await routeAiRequest({
    workflow: 'assistant',
    preference: allowCloud ? 'cloud' : 'local',
    sensitivity: allowCloud ? 'non_sensitive' : 'sensitive',
    allowCloud,
    prompt: `Jawab percakapan berikut dengan akurat, ringkas, dan berbahasa Indonesia. Jangan mengarang fakta.\n\n${transcript}`,
  });
  return { answer: result.text, penyedia: result.provider };
}

export async function generateBrowserPlanning({ uid, paketId, jenis, noUnit, sinyal } = {}) {
  requireUser(uid);
  if (sinyal?.aborted) throw new DOMException('Permintaan dibatalkan.', 'AbortError');
  const context = await bacaInputAi({ uid, paketId, jenis, noUnit });
  const requiredShape = jenis === 'atp'
    ? '{"cp":[{"elemen":"...","cp":"teks sumber persis"}],"unit":[{"no":1,"nama":"...","elemen":"...","semester":1,"tp":[{"kode":"E.1","rumusan":"...","materi":"...","jp":1}]}]}'
    : jenis === 'kktp'
      ? '{"ambang":75,"items":[{"kode":"...","indikator":["..."],"rubrik":{"perluBimbingan":"...","cukup":"...","baik":"...","sangatBaik":"..."}}]}'
      : '{"tujuanKode":["..."],"model":"...","pemahamanBermakna":["..."],"pertanyaanPemantik":["..."],"dimensiProfil":["..."],"sarpras":["..."],"pertemuan":[{"ke":1,"judul":"...","tujuan":"...","menit":40,"pendahuluan":["..."],"inti":["..."],"penutup":["..."]}],"asesmen":{"diagnostik":"...","formatif":"...","sumatif":"..."},"remedial":"...","pengayaan":"...","refleksiGuru":["..."],"refleksiSiswa":["..."]}';
  const result = await routeAiRequest({
    workflow: 'planning',
    sensitivity: 'sensitive',
    signal: sinyal,
    prompt: [
      `Susun draf ${jenis} untuk perencanaan pembelajaran.`,
      'Ikuti struktur JSON yang diwajibkan dan jangan menambah properti.',
      'Jangan mengarang, mengubah, atau memparafrase teks CP dan kode TP pada input.',
      'Kembalikan hanya objek JSON; seluruh teks berbahasa Indonesia.',
      `Struktur: ${requiredShape}`,
      `Konteks sumber: ${JSON.stringify(context)}`,
    ].join('\n'),
  });
  const parsed = parsePlanningOutput(jenis, result.text, {
    cp: context.cp,
    kodeTp: context.kodeTp,
  });
  return { payload: parsed, penyedia: result.provider };
}
