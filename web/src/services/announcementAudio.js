const SAPAAN = 'Selamat datang di Ainnoe Learning Ecosystem. Silakan lanjutkan aktivitas Anda.';
const NOTIFIKASI_AKTIF = 'Suara pemberitahuan diaktifkan.';

let enabled = true;
let started = false;
let speaking = false;
let generation = 0;
const queue = [];

function dukungSuara() {
  return typeof window !== 'undefined' &&
    'speechSynthesis' in window &&
    typeof SpeechSynthesisUtterance === 'function';
}

function suaraBahasaIndonesia() {
  const voices = window.speechSynthesis.getVoices();
  return voices.find((voice) => /^id-ID$/i.test(voice.lang)) || null;
}

export function suaraIndonesiaTersedia() {
  return dukungSuara() && Boolean(suaraBahasaIndonesia());
}

export function pantauSuaraIndonesia(onChange) {
  if (!dukungSuara()) {
    onChange(false);
    return () => {};
  }

  const synthesis = window.speechSynthesis;
  const perbarui = () => {
    onChange(suaraIndonesiaTersedia());
    lanjutkanAntrean();
  };
  perbarui();
  synthesis.addEventListener?.('voiceschanged', perbarui);
  return () => synthesis.removeEventListener?.('voiceschanged', perbarui);
}

function lanjutkanAntrean() {
  if (!enabled || speaking || !queue.length || !dukungSuara()) return;
  const voice = suaraBahasaIndonesia();
  if (!voice) return;
  const utterance = new SpeechSynthesisUtterance(queue.shift());
  const utteranceGeneration = generation;
  utterance.lang = 'id-ID';
  utterance.rate = 0.92;
  utterance.pitch = 1;
  utterance.volume = 0.9;
  utterance.voice = voice;
  utterance.onend = () => {
    if (utteranceGeneration !== generation) return;
    speaking = false;
    lanjutkanAntrean();
  };
  utterance.onerror = (event) => {
    if (utteranceGeneration !== generation) return;
    console.warn('[audio] Pemberitahuan suara tidak dapat diputar:', event.error || 'unknown');
    speaking = false;
    lanjutkanAntrean();
  };
  speaking = true;
  window.speechSynthesis.speak(utterance);
}

function ucapkan(teks) {
  const pesan = String(teks || '')
    .replace(/\bAI[_-]?nnoe\b/gi, 'Ainnoe')
    .replace(/\s+/g, ' ')
    .trim();
  if (!enabled || !pesan || !dukungSuara()) return;
  queue.push(pesan);
  if (started) lanjutkanAntrean();
}

function aktifkanDariInteraksi(event) {
  if (!event.isTrusted || !enabled || started || !dukungSuara()) return;
  started = true;
  queue.unshift(SAPAAN);
  lanjutkanAntrean();
}

export function pasangAudioPembuka() {
  if (typeof document === 'undefined') return () => {};
  document.addEventListener('pointerdown', aktifkanDariInteraksi, { once: true, capture: true });
  document.addEventListener('keydown', aktifkanDariInteraksi, { once: true, capture: true });
  return () => {
    document.removeEventListener('pointerdown', aktifkanDariInteraksi, true);
    document.removeEventListener('keydown', aktifkanDariInteraksi, true);
  };
}

export function audioNotifikasiAktif() {
  return enabled;
}

export function aturAudioNotifikasi(value) {
  enabled = Boolean(value);
  if (!enabled) {
    queue.length = 0;
    generation += 1;
    if (dukungSuara()) window.speechSynthesis.cancel();
    speaking = false;
    return { enabled, hasIndonesianVoice: suaraIndonesiaTersedia() };
  }
  if (started) ucapkan(NOTIFIKASI_AKTIF);
  return { enabled, hasIndonesianVoice: suaraIndonesiaTersedia() };
}

export function ucapkanNotifikasi(teks) {
  ucapkan(teks || 'Ada pemberitahuan baru.');
}
