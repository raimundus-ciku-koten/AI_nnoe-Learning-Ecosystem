// Jalankan: node --test web/tests/
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  idValid, urlAman, formatUkuran, namaBerkasAman, periksaBerkas,
  waktuDaftar, statusTerakhirDilihat, presenceMasihAktif, MASA_AKTIF_PRESENCE,
  ringkas, pesanGalatChat, MAKS_BERKAS,
  jalurLampiranValid, jalurLampiranDariUrl, namaLampiranTampil
} from '../src/utils/chatUtil.js';

test('idValid menolak karakter berbahaya', () => {
  assert.ok(idValid('d_abc_DEF-1'));
  for (const x of ['', 'a/b', 'a.b', '../x', null, 'a b', 'x'.repeat(161)]) assert.equal(idValid(x), false);
});
test('urlAman hanya Supabase Storage / loopback', () => {
  assert.ok(urlAman('https://project.supabase.co/storage/v1/object/sign/chat/file?token=1'));
  assert.ok(urlAman('http://127.0.0.1:54321/storage/v1/object/sign/chat/file'));
  for (const x of ['javascript:alert(1)', 'data:text/html,x', 'https://evil.example/x', 'https://example.firebaseapp.com/storage/v1/object/sign/chat/file', undefined])
    assert.equal(urlAman(x), false);
});
test('validasi jalur lampiran membatasi percakapan dan pemilik unggahan', () => {
  const owner = '11111111-1111-4111-8111-111111111111';
  const conversation = '22222222-2222-4222-8222-222222222222';
  const path = `chat/${owner}/${conversation}/123_file.pdf`;
  assert.equal(jalurLampiranValid(path, conversation, owner), true);
  assert.equal(jalurLampiranValid(path, conversation, '33333333-3333-4333-8333-333333333333'), false);
  assert.equal(jalurLampiranValid(`chat/${owner}/other/file.pdf`, conversation), false);
  assert.equal(jalurLampiranValid(`chat/${owner}/${conversation}/../secret`, conversation), false);
});
test('migrasi URL storage menerima hanya jalur lampiran chat', () => {
  const owner = '11111111-1111-4111-8111-111111111111';
  const conversation = '22222222-2222-4222-8222-222222222222';
  const path = `chat/${owner}/${conversation}/123_file.pdf`;
  const url = `https://project.supabase.co/storage/v1/object/sign/chat-attachments/${encodeURIComponent(path)}?token=secret`;
  assert.equal(jalurLampiranDariUrl(url, conversation), path);
  assert.equal(jalurLampiranDariUrl(`https://evil.example/${encodeURIComponent(path)}`, conversation), null);
  assert.equal(jalurLampiranDariUrl(url, '33333333-3333-4333-8333-333333333333'), null);
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
test('presence kedaluwarsa setelah tiga interval heartbeat', () => {
  const now = Date.now();
  assert.equal(presenceMasihAktif({ online: true, lastSeen: now - MASA_AKTIF_PRESENCE }, now), true);
  assert.equal(presenceMasihAktif({ online: true, lastSeen: now - MASA_AKTIF_PRESENCE - 1 }, now), false);
  assert.equal(presenceMasihAktif({ online: true, lastSeen: now + 1 }, now), false);
  assert.equal(presenceMasihAktif({ online: false, lastSeen: now }, now), false);
  assert.equal(presenceMasihAktif({ online: true, lastSeen: NaN }, now), false);
});
test('ringkas', () => {
  assert.equal(ringkas('  a   b  ', 10), 'a b');
  assert.equal(ringkas('abcdef', 4), 'abc…');
});
test('pesanGalatChat', () => {
  assert.match(pesanGalatChat({ code: 'PERMISSION_DENIED' }, 'kirim'), /kontak/);
  assert.equal(pesanGalatChat({ name: 'GalatKontak', message: 'Sudah menjadi kontak.' }), 'Sudah menjadi kontak.');
  assert.equal(pesanGalatChat(null), 'Terjadi kesalahan. Silakan coba lagi.');
});
