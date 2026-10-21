'use strict';

const BATAS_TOKEN_PER_KIRIM = 500;

function buatPayloadNotifikasi({ chatId, pesan, meta }) {
  const pengirim = meta.names?.[pesan.senderId] || 'Seseorang';
  const judul = meta.type === 'group' ? meta.name || 'Grup' : pengirim;
  const awalan = meta.type === 'group' ? `${pengirim}: ` : '';
  const isi = pesan.type === 'text'
    ? awalan + String(pesan.text || '').slice(0, 120)
    : awalan + (pesan.type === 'image' ? 'Mengirim foto' : 'Mengirim berkas');
  const url = `/chat/${chatId}`;

  return {
    chatId,
    title: judul,
    body: isi,
    url,
    judul,
    isi,
    link: url,
  };
}

function bacaTokenPerangkat(uid, data) {
  return Object.entries(data || {})
    .filter(([, token]) => typeof token === 'string' && token.trim().length > 0)
    .map(([tokenId, token]) => ({ uid, tokenId, token }));
}

function kelompokkanToken(tokens) {
  const kelompok = [];
  for (let i = 0; i < tokens.length; i += BATAS_TOKEN_PER_KIRIM) {
    kelompok.push(tokens.slice(i, i + BATAS_TOKEN_PER_KIRIM));
  }
  return kelompok;
}

module.exports = {
  BATAS_TOKEN_PER_KIRIM,
  buatPayloadNotifikasi,
  bacaTokenPerangkat,
  kelompokkanToken,
};
