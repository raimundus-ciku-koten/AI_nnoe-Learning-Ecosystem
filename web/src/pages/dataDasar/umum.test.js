// Jalankan: npx vitest run
import { describe, it, expect } from 'vitest';
import {
  CODE128_POLA, CODE128_START_B, CODE128_STOP,
  nilaiCode128B, bitCode128B, barcodeCode128SVG, barcodeCode39SVG, bitCode39,
} from './barcode.js';
import { buatKodeSiswa, fnv1a32, kodeSiswaValid, urlScanKode } from './kodeSiswa.js';

function decode128(bit) {
  const nilai = [];
  for (let i = 0; i < bit.length;) {
    const idx = CODE128_POLA.findIndex((p) => bit.startsWith(p, i));
    if (idx < 0) throw new Error(`pola tak dikenal @${i}`);
    nilai.push(idx);
    i += CODE128_POLA[idx].length;
  }
  return nilai;
}

describe('Code128-B', () => {
  it('semua pola valid (11 modul, 6 elemen; stop 13 modul)', () => {
    CODE128_POLA.forEach((p, i) => {
      expect(p.length).toBe(i === 106 ? 13 : 11);
      const runs = p.match(/1+|0+/g);
      expect(runs.length).toBe(i === 106 ? 7 : 6);
    });
  });
  it('round-trip encode → decode + checksum benar', () => {
    const teks = 'ALE-7A-3F9K2P-9012';
    const { bit } = bitCode128B(teks);
    const n = decode128(bit);
    expect(n[0]).toBe(CODE128_START_B);
    expect(n[n.length - 1]).toBe(CODE128_STOP);
    const data = n.slice(1, -2);
    const sum = (CODE128_START_B + data.reduce((a, v, i) => a + v * (i + 1), 0)) % 103;
    expect(n[n.length - 2]).toBe(sum);
    expect(String.fromCharCode(...data.map((v) => v + 32))).toBe(teks);
  });
  it('karakter non-ASCII diganti ?', () => {
    expect(nilaiCode128B('aé').kode).toBe('a?');
  });
  it('SVG memuat label ter-escape & zona tenang', () => {
    const svg = barcodeCode128SVG('<x>&');
    expect(svg).toContain('&lt;x&gt;&amp;');
    expect(svg).toContain('M16.00 0h'); // 10 modul × 1.6
  });
});

describe('Code39', () => {
  it('diapit * dan huruf kecil jadi kapital', () => {
    expect(bitCode39('ab').kode).toBe('AB');
    expect(barcodeCode39SVG('ab')).toContain('<svg');
  });
});

describe('kode siswa', () => {
  it('FNV-1a vektor uji baku', () => {
    expect(fnv1a32('')).toBe(0x811c9dc5);
    expect(fnv1a32('a')).toBe(0xe40c292c);
    expect(fnv1a32('foobar')).toBe(0xbf9cf968);
  });
  it('deterministik, valid, dan menghormati kodeUnik tersimpan', () => {
    const s = { id: 'abc123xyz', nama: 'Budi', nisn: '0012349012', kelas: '7A' };
    const k = buatKodeSiswa(s);
    expect(buatKodeSiswa(s)).toBe(k);
    expect(kodeSiswaValid(k)).toBe(true);
    expect(k.endsWith('-9012')).toBe(true);
    expect(buatKodeSiswa({ ...s, kodeUnik: 'ALE-X-AAAAAA-0001' })).toBe('ALE-X-AAAAAA-0001');
    expect(buatKodeSiswa(s, '#1')).not.toBe(k);
  });
  it('URL scan', () => {
    expect(urlScanKode('ALE 1/2', 'https://x.id')).toBe('https://x.id/#/scan/ALE%201%2F2');
  });
});
