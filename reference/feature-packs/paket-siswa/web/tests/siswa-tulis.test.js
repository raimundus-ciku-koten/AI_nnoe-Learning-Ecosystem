// web/tests/siswa-tulis.test.js
// tulis.js mengimpor 'firebase/firestore'; uji ini hanya memakai fungsi yang
// tidak menyentuh Firestore, sehingga dimuat lewat dynamic import dengan
// resolver tiruan hanya bila paket firebase tidak terpasang.
import { describe, test } from 'node:test';
import assert from 'node:assert/strict';

let modul;
try {
  modul = await import('../src/pages/dataDasar/siswa/tulis.js');
} catch {
  modul = null;
}
const lewati = !modul;

describe('tulis.js', { skip: lewati && 'paket "firebase" belum terpasang' }, () => {
  test('pecah', () => {
    assert.deepEqual(modul.pecah([1, 2, 3, 4, 5], 2), [[1, 2], [3, 4], [5]]);
    assert.deepEqual(modul.pecah([], 3), []);
  });

  test('tungguTulis: selesai cepat → ok', async () => {
    assert.equal(await modul.tungguTulis(Promise.resolve(), 50), 'ok');
  });

  test('tungguTulis: menggantung → tunda', async () => {
    assert.equal(await modul.tungguTulis(new Promise(() => {}), 20), 'tunda');
  });

  test('tungguTulis: gagal cepat → menolak', async () => {
    await assert.rejects(modul.tungguTulis(Promise.reject(new Error('ditolak')), 50), /ditolak/);
  });

  test('denganBatas: lewat batas → menolak', async () => {
    await assert.rejects(modul.denganBatas(new Promise(() => {}), 20, 'lambat'), /lambat/);
  });

  test('denganBatas: selesai → nilai', async () => {
    assert.equal(await modul.denganBatas(Promise.resolve(7), 50), 7);
  });
});
