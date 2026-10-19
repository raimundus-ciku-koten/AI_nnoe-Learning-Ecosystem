import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const page = await readFile(new URL('../src/pages/AttendancePage.jsx', import.meta.url), 'utf8');
const service = await readFile(new URL('../src/services/absensi.js', import.meta.url), 'utf8');
const scanPage = await readFile(new URL('../src/pages/scan.js', import.meta.url), 'utf8');
const barcodePage = await readFile(new URL('../src/pages/dataDasar/tabBarcode.js', import.meta.url), 'utf8');
const printCards = await readFile(new URL('../src/pages/dataDasar/kartuCetak.js', import.meta.url), 'utf8');

test('attendance history uses the deployed owner and student columns', () => {
  assert.match(page, /\.from\('attendance_records'\)[\s\S]*?\.eq\('owner_id', user\.uid\)/);
  assert.match(page, /record\.student_id/g);
  assert.doesNotMatch(page, /guru_uid|siswa_id/);
});

test('scan lookups and idempotent writes match the Supabase attendance schema', () => {
  assert.match(service, /\.from\('students'\)/);
  assert.match(service, /\.eq\('owner_id', uid\)/);
  assert.match(service, /student_id: siswa\.id/);
  assert.match(service, /tenant_id: siswa\.tenantId/);
  assert.match(service, /\.eq\('student_id', siswaId\)/);
  assert.doesNotMatch(service, /firebase|firestore|guru_uid|siswa_id/i);
});

test('public scan confirmation does not render NISN, class, or the bearer token', () => {
  assert.doesNotMatch(scanPage, /siswa\.nisn/);
  assert.doesNotMatch(scanPage, /siswa\.kelas/);
  assert.doesNotMatch(scanPage, /<code class="dd-kode">/);
  assert.match(scanPage, /split\(\/\\s\+\/\)\[0\]/);
});

test('new cards use an app QR only for saved tokens while retaining 1D barcode support', () => {
  assert.match(barcodePage, /const kodeSiswa = \(s\) => kodeTersimpan\(s\)/);
  assert.match(barcodePage, /buatSvgQr\(tautan\)/);
  assert.match(barcodePage, /svgCode128\(kode/);
  assert.match(barcodePage, /filter\(\(s\) => Boolean\(kodeTersimpan\(s\)\)\)/);
  assert.match(printCards, /\.k \.qr \{ width: 20mm/);
  assert.match(printCards, /const qrSvg = SVG_AMAN/);
});
