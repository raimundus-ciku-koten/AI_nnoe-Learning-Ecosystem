import { routeAiRequest } from './aiProviders.js';
import { MODUL_SISWA_BAGIAN, susunPromptModulSiswa } from './studentModuleAiPrompts.js';

const LEVEL_MODUL = new Set(['Campuran', 'LOT', 'MOT', 'HOTS']);
const BATAS_RESPONS = 40000;
const BATAS_KONTEKS = Object.freeze({
  asesmenProsem: 300,
  profilProsem: 200,
  metadataAtp: 2000,
  sumberPustaka: 2000,
  catatan: 400,
  tahunAjaran: 30,
  penulis: 100,
  sekolah: 150,
});

function wajibTeks(value, label, maximum) {
  if (typeof value !== 'string') throw new TypeError(`${label} wajib berupa teks.`);
  const text = value.trim();
  if (!text) throw new TypeError(`${label} wajib diisi.`);
  if (text.length > maximum) throw new RangeError(`${label} maksimal ${maximum} karakter.`);
  return text;
}

function opsionalTeks(value, label, maximum) {
  if (value == null || value === '') return '';
  if (typeof value !== 'string') throw new TypeError(`${label} wajib berupa teks.`);
  const text = value.trim();
  if (text.length > maximum) throw new RangeError(`${label} maksimal ${maximum} karakter.`);
  return text;
}

export function validasiInputModulSiswa(input) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) {
    throw new TypeError('Input Modul Siswa tidak valid.');
  }
  const jumlahJP = Number(input.jumlahJP);
  const durasi = Number(input.durasi);
  if (!Number.isInteger(jumlahJP) || jumlahJP < 1 || jumlahJP > 40) {
    throw new RangeError('Alokasi waktu harus berupa bilangan bulat 1–40 JP.');
  }
  if (!Number.isInteger(durasi) || durasi < 15 || durasi > 180) {
    throw new RangeError('Durasi setiap JP harus berupa bilangan bulat 15–180 menit.');
  }
  if (typeof input.level !== 'string' || !LEVEL_MODUL.has(input.level)) {
    throw new TypeError('Level kognitif tidak dikenal.');
  }
  const normalized = {
    mapel: wajibTeks(input.mapel, 'Mata pelajaran', 100),
    kelas: wajibTeks(input.kelas, 'Kelas/fase', 40),
    topik: wajibTeks(input.topik, 'Topik/materi', 200),
    tp: wajibTeks(input.tp, 'Tujuan pembelajaran', 300),
    jumlahJP,
    durasi,
    level: input.level,
  };
  for (const [field, maximum] of Object.entries(BATAS_KONTEKS)) {
    normalized[field] = opsionalTeks(input[field], field, maximum);
  }
  return normalized;
}

function parseJsonResponse(raw) {
  const cleaned = raw.replace(/^```(?:json)?\s*|\s*```$/g, '').trim();
  try {
    return JSON.parse(cleaned);
  } catch {
    throw new Error('AI_nnoe lokal tidak mengembalikan JSON Modul Siswa yang valid.');
  }
}

function blokHeading(markdown, pattern) {
  const lines = markdown.split(/\r?\n/);
  const start = lines.findIndex((line) => /^#{2,4}\s+/.test(line) && pattern.test(line));
  if (start < 0) return '';
  const body = [];
  for (let index = start + 1; index < lines.length; index += 1) {
    if (/^#{2,4}\s+/.test(lines[index])) break;
    body.push(lines[index]);
  }
  return body.join('\n').trim();
}

function nomorButir(block) {
  return [...block.matchAll(/^\s*(\d+)[.)]\s+\S.*$/gm)].map((match) => Number(match[1]));
}

function validasiSoalAsesmen(markdown) {
  const pg = blokHeading(markdown, /pilihan\s+ganda/i);
  const uraian = blokHeading(markdown, /uraian/i);
  const kasus = blokHeading(markdown, /studi\s+kasus/i);
  const nomorPg = nomorButir(pg);
  const nomorUraian = nomorButir(uraian);
  const nomorKasus = nomorButir(kasus);
  if (nomorPg.length !== 5 || nomorPg.some((nomor, index) => nomor !== index + 1) ||
      nomorUraian.length !== 3 || nomorUraian.some((nomor, index) => nomor !== index + 1) ||
      nomorKasus.length !== 1 || nomorKasus[0] !== 1) {
    throw new Error('Bagian asesmen harus memuat tepat 5 pilihan ganda, 3 uraian, dan 1 studi kasus bernomor urut.');
  }
  const pgItems = pg.split(/^\s*(\d+)[.)]\s+/m).slice(1);
  for (let index = 1; index < pgItems.length; index += 2) {
    const number = pgItems[index - 1];
    const body = pgItems[index] || '';
    const options = [...body.matchAll(/^\s*([A-D])[.)]\s+\S.*$/gm)].map((match) => match[1]);
    if (new Set(options).size !== 4 || !['A', 'B', 'C', 'D'].every((letter) => options.includes(letter))) {
      throw new Error(`Pilihan ganda nomor ${number} harus memiliki opsi A–D yang lengkap.`);
    }
  }
  return { pg, uraian, kasus };
}

function validasiKunciJawaban(markdown, soalAsesmen) {
  const kunciPg = blokHeading(markdown, /kunci\s+pilihan\s+ganda/i);
  const kunciUraian = blokHeading(markdown, /pedoman\s+jawaban\s+uraian/i);
  const kunciKasus = blokHeading(markdown, /analisis\s+studi\s+kasus/i);
  const pg = nomorButir(kunciPg);
  const uraian = nomorButir(kunciUraian);
  const kasus = nomorButir(kunciKasus);
  if (pg.length !== 5 || pg.some((nomor, index) => nomor !== index + 1) ||
      uraian.length !== 3 || uraian.some((nomor, index) => nomor !== index + 1) ||
      kasus.length !== 1 || kasus[0] !== 1) {
    throw new Error('Kunci harus memasangkan 5 pilihan ganda, 3 uraian, dan 1 studi kasus dengan nomor yang benar.');
  }
  const soal = validasiSoalAsesmen(soalAsesmen);
  const letters = [...kunciPg.matchAll(/^\s*(\d+)[.)]\s*(?:Kunci\s*:\s*)?([A-D])(?:\s*[—–:-]\s*|\s+\S)/gim)];
  if (letters.length !== 5) {
    throw new Error('Setiap kunci pilihan ganda harus menyebutkan satu huruf A–D dan pembahasan.');
  }
  const questionBlocks = soal.pg.split(/^\s*\d+[.)]\s+/m).slice(1);
  const answersByNumber = new Map(letters.map((match) => [Number(match[1]), match[2].toUpperCase()]));
  for (let index = 0; index < questionBlocks.length; index += 1) {
    const key = answersByNumber.get(index + 1);
    if (!key || !new RegExp(`^\\s*${key}[.)]\\s+\\S`, 'm').test(questionBlocks[index])) {
      throw new Error(`Kunci pilihan ganda nomor ${index + 1} tidak cocok dengan opsi soal.`);
    }
  }
}

export function validasiBagianModulSiswa(raw, bagianIndex, soalAsesmen = '', input) {
  const definition = MODUL_SISWA_BAGIAN[bagianIndex];
  if (!definition) throw new RangeError('Bagian Modul Siswa tidak dikenal.');
  if (typeof raw !== 'string' || raw.length > BATAS_RESPONS) {
    throw new Error(`Respons ${definition.judul} terlalu panjang atau tidak berupa teks.`);
  }
  const payload = parseJsonResponse(raw);
  if (!payload || Object.keys(payload).length !== 1 ||
      typeof payload.markdown !== 'string') {
    throw new Error(`Format ${definition.judul} tidak lengkap.`);
  }
  const markdown = payload.markdown.trim();
  if (markdown.length < 80 || markdown.length > 20000 ||
      /<\s*\/?\s*[a-z][a-z0-9-]*(?:\s|\/?>)/i.test(markdown)) {
    throw new Error(`Isi ${definition.judul} kosong, terlalu panjang, atau memuat HTML yang tidak diizinkan.`);
  }
  if (bagianIndex === 6) validasiSoalAsesmen(markdown);
  if (bagianIndex === 7) {
    if (!input?.sumberPustaka && !/PERLU KONFIRMASI/i.test(markdown)) {
      throw new Error('Daftar pustaka tidak terverifikasi. Cantumkan sumber atau tandai PERLU KONFIRMASI.');
    }
    if (input?.sumberPustaka) {
      const normalizedOutput = markdown.toLocaleLowerCase('id-ID');
      const references = input.sumberPustaka.split(/\r?\n/).map((line) =>
        line.replace(/^\s*(?:[-*]|\d+[.)])\s*/, '').trim()).filter(Boolean);
      if (references.some((reference) => !normalizedOutput.includes(reference.toLocaleLowerCase('id-ID')))) {
        throw new Error('Daftar pustaka harus memuat sumber yang diberikan guru tanpa mengubahnya.');
      }
    }
  }
  if (bagianIndex === 8) validasiKunciJawaban(markdown, soalAsesmen);
  return { id: definition.id, judul: definition.judul, markdown };
}

export async function generateStudentModule({
  uid,
  input,
  startIndex = 0,
  existingSections = [],
  onSection,
  signal,
} = {}) {
  if (!String(uid || '').trim()) throw new Error('Sesi login tidak tersedia. Masuk kembali untuk menggunakan AI_nnoe lokal.');
  const normalizedInput = validasiInputModulSiswa(input);
  if (!Number.isInteger(startIndex) || startIndex < 0 || startIndex > MODUL_SISWA_BAGIAN.length) {
    throw new RangeError('Posisi bagian Modul Siswa tidak valid.');
  }
  if (!Array.isArray(existingSections) || existingSections.length !== startIndex) {
    throw new TypeError('Bagian Modul Siswa terdahulu tidak lengkap untuk melanjutkan draf.');
  }
  const validatedExisting = existingSections.map((section, index) => {
    if (!section || section.id !== MODUL_SISWA_BAGIAN[index].id ||
        typeof section.markdown !== 'string') {
      throw new TypeError('Urutan bagian Modul Siswa terdahulu tidak valid.');
    }
    return {
      ...validasiBagianModulSiswa(
        JSON.stringify({ markdown: section.markdown }),
        index,
        existingSections[6]?.markdown || '',
        normalizedInput,
      ),
      provider: section.provider,
      model: section.model,
      fallbackUsed: Boolean(section.fallbackUsed),
    };
  });
  const completed = [];
  let assessmentMarkdown = validatedExisting[6]?.markdown || '';

  for (let index = startIndex; index < MODUL_SISWA_BAGIAN.length; index += 1) {
    if (signal?.aborted) throw new DOMException('Permintaan dibatalkan.', 'AbortError');
    const prompt = susunPromptModulSiswa(normalizedInput, index, assessmentMarkdown);
    const result = await routeAiRequest({
      uid,
      workflow: 'modul_siswa',
      prompt,
      signal,
      validateResponse: (raw) => validasiBagianModulSiswa(
        raw,
        index,
        assessmentMarkdown,
        normalizedInput,
      ),
    });
    const section = {
      ...result.validated,
      provider: result.provider,
      model: result.model,
      fallbackUsed: Boolean(result.fallbackUsed),
    };
    completed.push(section);
    if (index === 6) assessmentMarkdown = section.markdown;
    onSection?.(section, index);
  }

  return { input: normalizedInput, sections: completed };
}
