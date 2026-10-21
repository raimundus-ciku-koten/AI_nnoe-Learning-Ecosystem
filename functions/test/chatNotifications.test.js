'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const {
  BATAS_TOKEN_PER_KIRIM,
  buatPayloadNotifikasi,
  bacaTokenPerangkat,
  kelompokkanToken,
} = require('../lib/chatNotifications');

test('membaca nilai token FCM dan mengabaikan catatan perangkat lama', () => {
  assert.deepEqual(bacaTokenPerangkat('user-a', {
    perangkat1: 'fcm-token-value',
    perangkatLama: 1729000000000,
    perangkatKosong: '',
  }), [{
    uid: 'user-a',
    tokenId: 'perangkat1',
    token: 'fcm-token-value',
  }]);
});

test('payload notifikasi kompatibel dengan worker latar dan toast foreground', () => {
  assert.deepEqual(buatPayloadNotifikasi({
    chatId: 'chat-a',
    pesan: { senderId: 'user-a', type: 'text', text: 'Halo' },
    meta: { type: 'direct', names: { 'user-a': 'Guru' } },
  }), {
    chatId: 'chat-a',
    title: 'Guru',
    body: 'Halo',
    url: '/chat/chat-a',
    judul: 'Guru',
    isi: 'Halo',
    link: '/chat/chat-a',
  });
});

test('payload grup menyertakan nama pengirim dan membatasi kiriman FCM hingga 500 token', () => {
  const payload = buatPayloadNotifikasi({
    chatId: 'group-a',
    pesan: { senderId: 'user-a', type: 'image' },
    meta: { type: 'group', name: 'Kelas 1', names: { 'user-a': 'Guru' } },
  });
  assert.equal(payload.title, 'Kelas 1');
  assert.equal(payload.body, 'Guru: Mengirim foto');

  const batches = kelompokkanToken(Array.from({ length: 501 }, (_, i) => i));
  assert.equal(BATAS_TOKEN_PER_KIRIM, 500);
  assert.deepEqual(batches.map((batch) => batch.length), [500, 1]);
});
