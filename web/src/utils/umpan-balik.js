// web/src/utils/umpan-balik.js
/**
 * umpan-balik.js — Getar + bunyi singkat sebagai konfirmasi scan.
 * Semua opsional & aman: gagal diam-diam bila perangkat/browser tidak mendukung
 * atau pengguna belum berinteraksi (kebijakan autoplay).
 */

let ctxAudio = null;

function bip(frekuensi, durasiMs) {
  try {
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    ctxAudio = ctxAudio || new AC();
    if (ctxAudio.state === 'suspended') ctxAudio.resume().catch(() => {});
    const osc = ctxAudio.createOscillator();
    const gain = ctxAudio.createGain();
    osc.frequency.value = frekuensi;
    gain.gain.value = 0.08;
    osc.connect(gain).connect(ctxAudio.destination);
    osc.start();
    osc.stop(ctxAudio.currentTime + durasiMs / 1000);
  } catch { /* abaikan */ }
}

function getar(pola) {
  try { if (navigator.vibrate) navigator.vibrate(pola); } catch { /* abaikan */ }
}

/** @param {'sukses'|'sudah'|'gagal'} jenis */
export function umpanBalik(jenis) {
  if (jenis === 'sukses') { getar(80); bip(880, 120); }
  else if (jenis === 'sudah') { getar([60, 60, 60]); bip(660, 160); }
  else { getar([200, 80, 200]); bip(220, 260); }
}
