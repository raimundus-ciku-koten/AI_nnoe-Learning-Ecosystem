'use strict';

const { hasilDariModel, adaPenyediaAktif, SemuaPenyediaGagal } = require('./providers');
const { ambilSlot } = require('./ratelimit');

class GalatSoal extends Error {
  constructor(kode, pesan) { super(pesan); this.kode = kode; }
}

const ringkas = (value, max) => typeof value === 'string'
  ? value.replace(/[\u0000-\u001f\u007f]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, max)
  : '';

function validasiMasukan(data) {
  const mapel = ringkas(data?.mapel, 80);
  const kelas = ringkas(data?.kelas, 30);
  const topik = ringkas(data?.topik, 500);
  const jenis = data?.jenis;
  if (!mapel || !kelas || !topik || !['pilihan_ganda', 'uraian'].includes(jenis)) {
    throw new GalatSoal('invalid-argument', 'Mata pelajaran, kelas, topik, dan bentuk soal wajib diisi.');
  }
  return { mapel, kelas, topik, jenis };
}

function uraiDraf(teks, jenis) {
  let data;
  try {
    data = JSON.parse(teks);
  } catch {
    throw new Error('AI response is not valid JSON.');
  }
  if (!Array.isArray(data?.questions) || data.questions.length !== 1) {
    throw new Error('AI must return exactly one question draft.');
  }
  const item = data.questions[0];
  const question = ringkas(item?.pertanyaan, 2000);
  const answer = ringkas(item?.jawaban, 1000);
  const explanation = ringkas(item?.pembahasan, 2000);
  const choices = jenis === 'pilihan_ganda' && Array.isArray(item?.pilihan)
    ? item.pilihan.map((choice) => ringkas(choice, 300))
    : [];
  if (!question || !answer || !explanation) throw new Error('AI question fields are incomplete.');
  if (jenis === 'pilihan_ganda' &&
      (choices.length < 2 || choices.length > 5 || choices.some((choice) => !choice) ||
       new Set(choices).size !== choices.length || !choices.includes(answer))) {
    throw new Error('AI multiple-choice options are invalid.');
  }
  return {
    questions: [{
      jenis,
      pertanyaan: question,
      pilihan: choices,
      jawaban: answer,
      pembahasan: explanation
    }]
  };
}

async function tanganiSoal({ req, db, config, fetchFn, log }) {
  if (!req.auth?.uid) throw new GalatSoal('unauthenticated', 'Silakan masuk untuk membuat draf soal.');
  if (req.auth.token?.role !== 'guru' || typeof req.auth.token?.tenantId !== 'string' ||
      !req.auth.token.tenantId) {
    throw new GalatSoal('permission-denied', 'Fitur draf soal hanya tersedia untuk guru sekolah.');
  }
  const { mapel, kelas, topik, jenis } = validasiMasukan(req.data);
  if (!adaPenyediaAktif(config)) {
    throw new GalatSoal('failed-precondition', 'Belum ada provider AI yang dikonfigurasi.');
  }
  const slotOk = await ambilSlot(db, req.auth.uid, {
    perJam: config.perJam,
    perHari: config.perHari
  });
  if (!slotOk) throw new GalatSoal('resource-exhausted', 'Batas penggunaan AI tercapai. Coba lagi nanti.');
  const prompt = [
    'Buat tepat satu draf soal pendidikan dalam bahasa Indonesia.',
    'Keluaran wajib JSON murni tanpa markdown dengan bentuk:',
    '{"questions":[{"pertanyaan":"...","pilihan":["..."],"jawaban":"...","pembahasan":"..."}]}',
    'Untuk uraian, pilihan harus berupa array kosong. Jangan membuat fakta atau sumber palsu.',
    `Mata pelajaran: ${mapel}. Kelas/fase: ${kelas}. Bentuk: ${jenis}.`,
    `Topik dan konteks: ${topik}`
  ].join('\n');
  try {
    return await hasilDariModel({
      prompt,
      urai: (text) => uraiDraf(text, jenis),
      config,
      fetchFn,
      log
    });
  } catch (error) {
    if (error instanceof SemuaPenyediaGagal) {
      log?.(`draf soal gagal: ${error.rincian.join(',')}`);
      const temporary = error.rincian.some((entry) => /status_(429|5\d\d|jaringan)/.test(entry));
      throw new GalatSoal(temporary ? 'unavailable' : 'internal', 'AI belum dapat membuat draf soal. Coba lagi nanti.');
    }
    throw new GalatSoal('internal', 'Terjadi kesalahan saat membuat draf soal.');
  }
}

module.exports = { GalatSoal, validasiMasukan, uraiDraf, tanganiSoal };
