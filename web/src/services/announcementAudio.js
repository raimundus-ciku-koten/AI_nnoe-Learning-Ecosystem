const SAPAAN = 'AI_nnoe Corp by Raimundus Ciku Koten';
const NOTIFIKASI = 'AI_nnoe';

let enabled = true;
let started = false;
let speaking = false;
const queue = [];

function dukungSuara() {
  return typeof window !== 'undefined' &&
    'speechSynthesis' in window &&
    typeof SpeechSynthesisUtterance === 'function';
}

function suaraBahasaIndonesia() {
  const voices = window.speechSynthesis.getVoices();
  return voices.find((voice) => /^id(?:-|$)/i.test(voice.lang)) || null;
}

function lanjutkanAntrean() {
  if (!enabled || speaking || !queue.length || !dukungSuara()) return;
  const utterance = new SpeechSynthesisUtterance(queue.shift());
  utterance.lang = 'id-ID';
  utterance.rate = 0.94;
  utterance.pitch = 0.86;
  utterance.volume = 0.85;
  utterance.voice = suaraBahasaIndonesia();
  utterance.onend = () => {
    speaking = false;
    lanjutkanAntrean();
  };
  utterance.onerror = () => {
    speaking = false;
    lanjutkanAntrean();
  };
  speaking = true;
  window.speechSynthesis.speak(utterance);
}

function ucapkan(teks) {
  if (!enabled || !started || !dukungSuara()) return;
  queue.push(teks);
  lanjutkanAntrean();
}

function aktifkanDariInteraksi(event) {
  if (!event.isTrusted || !enabled || started || !dukungSuara()) return;
  started = true;
  ucapkan(SAPAAN);
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
    if (dukungSuara()) window.speechSynthesis.cancel();
    speaking = false;
    return;
  }
  if (started && !speaking) ucapkan(NOTIFIKASI);
}

export function ucapkanNotifikasi() {
  ucapkan(NOTIFIKASI);
}
