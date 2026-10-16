import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { catatanKeCsv, siapkanCatatanGuru } from '../src/services/teacherWorkspace.js';

const CATATAN_VALID = {
  modulePath: '/refleksi/pembelajaran',
  moduleLabel: 'Refleksi Pembelajaran',
  judul: 'Refleksi minggu pertama',
  tanggal: '2026-10-15',
  kelas: 'X-1',
  mapel: 'Matematika',
  isi: 'Tujuan pembelajaran tercapai.',
  status: 'draf',
};

describe('catatan kerja pribadi guru', () => {
  it('membersihkan input dan hanya menyimpan bidang yang didukung', () => {
    assert.deepEqual(siapkanCatatanGuru({ ...CATATAN_VALID, tambahan: 'abaikan' }), CATATAN_VALID);
  });

  it('menolak modul, tanggal, bidang wajib, dan panjang yang tidak valid', () => {
    assert.throws(() => siapkanCatatanGuru({ ...CATATAN_VALID, modulePath: '/platform/audit' }), /Modul catatan/);
    assert.throws(() => siapkanCatatanGuru({ ...CATATAN_VALID, tanggal: '2026-02-31' }), /Tanggal/);
    assert.throws(() => siapkanCatatanGuru({ ...CATATAN_VALID, isi: ' ' }), /Isi catatan/);
    assert.throws(() => siapkanCatatanGuru({ ...CATATAN_VALID, judul: 'x'.repeat(121) }), /maksimal 120/);
  });

  it('menghasilkan CSV dengan escaping untuk tanda kutip dan baris baru', () => {
    const csv = catatanKeCsv([{ ...CATATAN_VALID, judul: 'Rencana, "A"', isi: 'Baris satu\nBaris dua' }]);
    assert.match(csv, /"Rencana, ""A"""/);
    assert.match(csv, /"Baris satu\nBaris dua"/);
    assert.match(csv, /^"Modul","Judul","Tanggal"/);
  });
});
