import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { test } from 'node:test';

const audioUrl = new URL('../src/services/announcementAudio.js', import.meta.url).href;

function createHarness(voices = [{ lang: 'id-ID', name: 'Indonesian' }]) {
  const listeners = new Map();
  const voiceListeners = new Set();
  const utterances = [];
  const speechSynthesis = {
    getVoices: () => voices,
    speak: (utterance) => utterances.push(utterance),
    cancel: () => {},
    addEventListener: (name, listener) => {
      if (name === 'voiceschanged') voiceListeners.add(listener);
    },
    removeEventListener: (name, listener) => {
      if (name === 'voiceschanged') voiceListeners.delete(listener);
    },
  };
  class FakeUtterance {
    constructor(text) {
      this.text = text;
    }
  }

  globalThis.window = { speechSynthesis };
  globalThis.document = {
    addEventListener: (name, listener) => listeners.set(name, listener),
    removeEventListener: (name) => listeners.delete(name),
  };
  globalThis.SpeechSynthesisUtterance = FakeUtterance;

  return {
    listeners,
    utterances,
    setVoices(nextVoices) {
      voices = nextVoices;
      voiceListeners.forEach((listener) => listener());
    },
    async loadAudio() {
      return import(`${audioUrl}?test=${randomUUID()}`);
    },
    interact(event = { isTrusted: true }) {
      listeners.get('pointerdown')?.(event);
    },
  };
}

test('speaks a natural Indonesian welcome and queued notification after user interaction', async () => {
  const harness = createHarness([
    { lang: 'en-US', name: 'English' },
    { lang: 'id-ID', name: 'Indonesian' },
  ]);
  const audio = await harness.loadAudio();
  audio.pasangAudioPembuka();
  audio.ucapkanNotifikasi('Presensi berhasil disimpan.');

  assert.equal(harness.utterances.length, 0);
  harness.interact({ isTrusted: false });
  assert.equal(harness.utterances.length, 0);

  harness.interact();
  assert.equal(
    harness.utterances[0].text,
    'Selamat datang di Ainnoe Learning Ecosystem. Silakan lanjutkan aktivitas Anda.',
  );
  assert.equal(harness.utterances[0].lang, 'id-ID');
  assert.equal(harness.utterances[0].voice.name, 'Indonesian');
  assert.equal(harness.utterances[0].rate, 0.92);
  assert.equal(harness.utterances[0].pitch, 1);

  harness.utterances[0].onend();
  assert.equal(harness.utterances[1].text, 'Presensi berhasil disimpan.');
  assert.equal(harness.utterances[1].lang, 'id-ID');
});

test('waits for an id-ID voice instead of speaking with a non-Indonesian voice', async () => {
  const harness = createHarness([
    { lang: 'en-US', name: 'English' },
    { lang: 'id-MY', name: 'Bahasa Melayu' },
  ]);
  const audio = await harness.loadAudio();
  const availability = [];
  const stopWatching = audio.pantauSuaraIndonesia((available) => availability.push(available));
  assert.equal(audio.suaraIndonesiaTersedia(), false);
  audio.pasangAudioPembuka();
  harness.interact();
  assert.equal(harness.utterances.length, 0);

  audio.ucapkanNotifikasi('Proses selesai.');
  assert.deepEqual(audio.aturAudioNotifikasi(false), { enabled: false, hasIndonesianVoice: false });
  assert.equal(audio.audioNotifikasiAktif(), false);
  audio.aturAudioNotifikasi(true);
  harness.setVoices([{ lang: 'id-ID', name: 'Indonesian Indonesia' }]);
  assert.deepEqual(availability, [false, true]);
  assert.equal(harness.utterances[0].text, 'Suara pemberitahuan diaktifkan.');
  assert.equal(harness.utterances[0].voice.name, 'Indonesian Indonesia');
  stopWatching();
});

test('prefers an exact Indonesian voice and normalizes the spoken brand name', async () => {
  const harness = createHarness([
    { lang: 'id-MY', name: 'Indonesian regional' },
    { lang: 'en-US', name: 'English' },
    { lang: 'id-ID', name: 'Indonesian Indonesia' },
  ]);
  const audio = await harness.loadAudio();
  assert.equal(audio.suaraIndonesiaTersedia(), true);
  audio.ucapkanNotifikasi('Layanan AI_nnoe siap digunakan.');
  audio.pasangAudioPembuka();
  harness.interact();

  assert.equal(harness.utterances[0].voice.name, 'Indonesian Indonesia');
  harness.utterances[0].onend();
  assert.equal(harness.utterances[1].text, 'Layanan Ainnoe siap digunakan.');
  assert.equal(harness.utterances[1].voice.name, 'Indonesian Indonesia');
});

test('does not queue blank messages', async () => {
  const harness = createHarness();
  const audio = await harness.loadAudio();
  audio.pasangAudioPembuka();
  audio.ucapkanNotifikasi('   ');
  harness.interact();

  assert.equal(harness.utterances.length, 1);
  assert.equal(harness.utterances[0].text.startsWith('Selamat datang'), true);
});
