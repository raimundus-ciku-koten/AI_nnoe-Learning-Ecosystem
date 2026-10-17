// Jalankan: node --test web/tests/
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  idPribadi, idValid, urlAman, formatUkuran, namaBerkasAman, periksaBerkas,
  waktuDaftar, statusTerakhirDilihat, kunciToken, ringkas, pesanGalatChat, MAKS_BERKAS,
  jalurLampiranValid, jalurLampiranDariUrl, namaLampiranTampil
} from '../src/utils/chatUtil.js';

test('idPribadi sama dari kedua arah', () => {
  assert.equal(idPribadi('b', 'a'), 'd_a_b');
  assert.equal(idPribadi('a', 'b'), idPribadi('b', 'a'));
});
test('idValid menolak karakter berbahaya', () => {
  assert.ok(idValid('d_abc_DEF-1'));
  for (const x of ['', 'a/b', 'a.b', '../x', null, 'a b', 'x'.repeat(161)]) assert.equal(idValid(x), false);
});
test('urlAman hanya Cloud Storage / emulator', () => {
  assert.ok(urlAman('https://firebasestorage.googleapis.com/v0/b/x/o/chat%2Fa?alt=media&token=1'));
  assert.ok(urlAman('http://127.0.0.1:9199/v0/b/x/o/a'));
  for (const x of ['javascript:alert(1)', 'data:text/html,x', 'https://evil.example/x', 'http://firebasestorage.googleapis.com/x', undefined])
    assert.equal(urlAman(x), false);
});
test('validasi jalur lampiran membatasi percakapan dan pemilik unggahan', () => {
  assert.equal(jalurLampiranValid('chat/guru-a/d_guru-a_guru-b/123_file.pdf', 'd_guru-a_guru-b', 'guru-a'), true);
  assert.equal(jalurLampiranValid('chat/guru-a/d_guru-a_guru-b/123_file.pdf', 'd_guru-a_guru-b', 'guru-b'), false);
  assert.equal(jalurLampiranValid('chat/guru-a/d_lain/file.pdf', 'd_guru-a_guru-b'), false);
  assert.equal(jalurLampiranValid('chat/guru-a/d_guru-a_guru-b/../secret', 'd_guru-a_guru-b'), false);
});
test('migrasi URL Storage lama menerima hanya jalur lampiran chat', () => {
  const path = 'chat/guru-a/d_guru-a_guru-b/123_file.pdf';
  const url = `https://firebasestorage.googleapis.com/v0/b/example/o/${encodeURIComponent(path)}?alt=media&token=secret`;
  assert.equal(jalurLampiranDariUrl(url, 'd_guru-a_guru-b'), path);
  assert.equal(jalurLampiranDariUrl('https://evil.example/' + encodeURIComponent(path), 'd_guru-a_guru-b'), null);
  assert.equal(jalurLampiranDariUrl(url, 'd_other'), null);
});
test('periksaBerkas', () => {
  assert.deepEqual(periksaBerkas({ size: 10, type: 'image/png' }), { ok: true, jenis: 'image' });
  assert.deepEqual(periksaBerkas({ size: 10, type: 'application/pdf' }), { ok: true, jenis: 'file' });
  assert.equal(periksaBerkas({ size: 10, type: 'image/svg+xml' }).ok, false);
  assert.equal(periksaBerkas({ size: 0, type: 'image/png' }).ok, false);
  assert.equal(periksaBerkas({ size: MAKS_BERKAS, type: 'application/pdf' }).ok, true);
  assert.equal(periksaBerkas({ size: MAKS_BERKAS + 1, type: 'image/png' }).ok, false);
  assert.equal(periksaBerkas(null).ok, false);
});
test('namaBerkasAman', () => {
  assert.equal(namaBerkasAman('../../etc/pass wd.pdf'), 'etc_pass_wd.pdf');
  assert.equal(namaBerkasAman(''), 'berkas');
  assert.ok(namaBerkasAman('x'.repeat(300) + '.pdf').length <= 80);
});
test('menampilkan nama lampiran asli untuk semua jenis berkas', () => {
  assert.deepEqual(namaLampiranTampil('soal.docx'), { nama: 'soal.docx', dikonversi: false });
  assert.deepEqual(namaLampiranTampil('arsip.DOC'), { nama: 'arsip.DOC', dikonversi: false });
  assert.deepEqual(namaLampiranTampil('modul.pdf'), { nama: 'modul.pdf', dikonversi: false });
  assert.deepEqual(namaLampiranTampil(''), { nama: 'Berkas', dikonversi: false });
});
test('formatUkuran', () => {
  assert.equal(formatUkuran(500), '500 B');
  assert.equal(formatUkuran(2048), '2.0 KB');
  assert.equal(formatUkuran(5 * 1024 * 1024), '5.0 MB');
  assert.equal(formatUkuran(-1), '');
});
test('waktuDaftar', () => {
  const skrg = new Date(2026, 9, 14, 15, 0).getTime();
  assert.match(waktuDaftar(new Date(2026, 9, 14, 9, 5).getTime(), skrg), /\d{2}[.:]\d{2}/);
  assert.equal(waktuDaftar(new Date(2026, 9, 13, 9, 5).getTime(), skrg), 'Kemarin');
  assert.equal(waktuDaftar(0, skrg), '');
});
test('statusTerakhirDilihat', () => {
  const t = Date.now();
  assert.equal(statusTerakhirDilihat({ online: true }), 'Online');
  assert.equal(statusTerakhirDilihat({ online: false, lastSeen: t - 5 * 60000 }, t), 'Terakhir dilihat 5 menit lalu');
  assert.equal(statusTerakhirDilihat(null), '');
});
test('kunciToken & ringkas', () => {
  assert.equal(kunciToken('a.b#c$d[e]f/g'), 'a_b_c_d_e_f_g');
  assert.equal(ringkas('  a   b  ', 10), 'a b');
  assert.equal(ringkas('abcdef', 4), 'abc…');
});
test('pesanGalatChat', () => {
  assert.match(pesanGalatChat({ code: 'PERMISSION_DENIED' }, 'kirim'), /kontak/);
  assert.equal(pesanGalatChat({ name: 'GalatKontak', message: 'Sudah menjadi kontak.' }), 'Sudah menjadi kontak.');
  assert.equal(pesanGalatChat(null), 'Terjadi kesalahan. Silakan coba lagi.');
});
