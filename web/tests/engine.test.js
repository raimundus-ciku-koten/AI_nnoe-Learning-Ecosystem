import test from 'node:test';
import assert from 'node:assert/strict';

import { urai, keIso, seninPekan, formatTanggal } from '../src/pages/perencanaan/engine/tanggal.js';
import { normalisasiHari, hitungRpe, bangunPetaKalender } from '../src/pages/perencanaan/engine/rpe.js';
import {
  bagiProporsional, hitungAnggaran, hitungAnggaranAtp, jumlahJpTp, selaraskanJpAtp, hitungProta, rekapAtp, ratakanTp
} from '../src/pages/perencanaan/engine/prota.js';
import { hitungProsem } from '../src/pages/perencanaan/engine/prosem.js';
import { validasiKonteks, validasiAtp } from '../src/pages/perencanaan/engine/validator.js';
import { pekanDalamBulan } from '../src/pages/perencanaan/ui/render/format.js';
import { renderRpe } from '../src/pages/perencanaan/ui/render/rpe.js';
import { renderProta } from '../src/pages/perencanaan/ui/render/prota-prosem.js';

/* ---------- Data uji: pola contoh Matematika Kelas X (5 unit, 16 TP, 114 JP) ---------- */
const buatAtp = () => {
  const jpMentah = [6, 6, 7, 6, 7, 6, 6, 7, 6, 7, 6, 6, 7, 6, 6, 7]; // sengaja tak pas 114
  let k = 0;
  const pecah = [[4, 'Ganjil'], [3, 'Ganjil'], [3, 'Genap'], [3, 'Genap'], [3, 'Genap']];
  return {
    cp: [{ elemen: 'Bilangan', cp: 'CP uji' }],
    unit: pecah.map(([n, sem], i) => ({
      no: i + 1, nama: `Unit ${i + 1}`, elemen: 'Bilangan', semester: sem === 'Ganjil' ? 1 : 2,
      tp: Array.from({ length: n }, () => {
        k++;
        return { kode: `E.${k}`, rumusan: `Peserta didik mampu ${k}`, materi: `Materi ${k}`, jp: jpMentah[k - 1] };
      })
    }))
  };
};

const konteksDasar = {
  jpPerPekan: 4,
  hariPembelajaran: [1, 4],
  ganjil: { mulai: '2026-07-13', selesai: '2026-12-19' },
  genap: { mulai: '2027-01-05', selesai: '2027-06-19' },
  kalender: []
};

function denganDomUji(fn) {
  const propertiNode = Object.getOwnPropertyDescriptor(globalThis, 'Node');
  const propertiDocument = Object.getOwnPropertyDescriptor(globalThis, 'document');
  class NodeUji {
    constructor(tag, text = '') {
      this.tagName = tag;
      this.text = text;
      this.children = [];
      this.attributes = {};
      this.className = '';
    }

    append(...children) { this.children.push(...children); }
    setAttribute(name, value) { this.attributes[name] = String(value); }
    addEventListener() {}
    get textContent() { return this.tagName === '#text' ? this.text : this.children.map((child) => child.textContent).join(''); }
    querySelectorAll(tag) {
      return this.children.flatMap((child) => [
        ...(child.tagName === tag ? [child] : []),
        ...child.querySelectorAll(tag)
      ]);
    }
  }

  globalThis.Node = NodeUji;
  globalThis.document = {
    createElement: (tag) => new NodeUji(tag),
    createTextNode: (text) => new NodeUji('#text', String(text))
  };
  try {
    return fn();
  } finally {
    if (propertiNode) Object.defineProperty(globalThis, 'Node', propertiNode);
    else delete globalThis.Node;
    if (propertiDocument) Object.defineProperty(globalThis, 'document', propertiDocument);
    else delete globalThis.document;
  }
}

/* ---------- Tanggal ---------- */
test('urai menolak tanggal mustahil dan menerima tanggal kabisat', () => {
  assert.equal(urai('2026-02-30'), null);
  assert.equal(urai('2026-13-01'), null);
  assert.equal(urai('abc'), null);
  assert.notEqual(urai('2028-02-29'), null);
  assert.equal(urai('2027-02-29'), null);
});

test('seninPekan: Minggu mundur ke Senin sebelumnya', () => {
  assert.equal(keIso(seninPekan(urai('2026-07-19'))), '2026-07-13'); // Minggu
  assert.equal(keIso(seninPekan(urai('2026-07-13'))), '2026-07-13'); // Senin
});

test('formatTanggal tidak bergeser sehari (UTC)', () => {
  assert.match(formatTanggal('2026-08-17'), /17/);
});

test('pekanDalamBulan mengikuti pekan Senin dan batas bulan secara deterministik', () => {
  assert.equal(pekanDalamBulan('2026-08-01'), 1);
  assert.equal(pekanDalamBulan('2026-08-03'), 2);
  assert.equal(pekanDalamBulan('2026-08-31'), 6);
  assert.equal(pekanDalamBulan('2026-02-30'), 0);
});

/* ---------- Hari ---------- */
test('normalisasiHari: pola jumlah, nama, dan bawaan', () => {
  assert.deepEqual(normalisasiHari(3), [1, 3, 5]);
  assert.deepEqual(normalisasiHari('2'), [1, 4]);
  assert.deepEqual(normalisasiHari('Rabu, senin'), [1, 3]);
  assert.deepEqual(normalisasiHari([5, 5, 2]), [2, 5]);
  assert.deepEqual(normalisasiHari(undefined), [1, 2, 3, 4, 5]);
  assert.deepEqual(normalisasiHari('minggu'), [1, 2, 3, 4, 5]); // Minggu tidak dipakai → bawaan
});

/* ---------- RPE ---------- */
test('RPE: 23 pekan pada Ganjil 2026 tanpa libur, semua efektif', () => {
  const r = hitungRpe({ ...konteksDasar, hariPembelajaran: [1, 2, 3, 4, 5] });
  assert.equal(r.ganjil.pekan.length, 23);
  assert.equal(r.ganjil.rekap.efektif, 23);
  assert.equal(r.ganjil.rekap.totalJP, 23 * 4);
});

test('RPE: libur satu hari → pekan sebagian efektif; libur sepekan penuh → non-efektif', () => {
  const r = hitungRpe({
    ...konteksDasar,
    hariPembelajaran: [1, 2, 3, 4, 5],
    kalender: [
      { mulai: '2026-08-17', ket: 'HUT RI', efektif: false },
      { mulai: '2026-12-14', selesai: '2026-12-19', ket: 'Asesmen akhir semester', efektif: false }
    ]
  });
  const pekan = r.ganjil.pekan;
  const agustus17 = pekan.find((p) => p.hariPembelajaran.includes('2026-08-17'));
  assert.equal(agustus17.status, 'sebagian');
  assert.equal(agustus17.efektif, true);
  const terakhir = pekan[pekan.length - 1];
  assert.equal(terakhir.status, 'nonEfektif');
  assert.equal(r.ganjil.rekap.efektif, 22);
});

test('RPE: hari tidak efektif mengungguli entri efektif pada tanggal sama', () => {
  const peta = bangunPetaKalender([
    { mulai: '2026-08-17', ket: 'Hari efektif', efektif: true },
    { mulai: '2026-08-17', ket: 'Libur', efektif: false }
  ]);
  assert.equal(peta.get('2026-08-17').efektif, false);
});

test('RPE: rentang kalender di luar batas diabaikan, bukan membekukan peramban', () => {
  const peta = bangunPetaKalender([{ mulai: '2000-01-01', selesai: '2100-01-01', ket: 'x', efektif: false }]);
  assert.equal(peta.size, 0);
});

test('RPE: totalJP resmi guru menjadi acuan, selisih dilaporkan', () => {
  const r = hitungRpe({ ...konteksDasar, totalJP: 114 });
  assert.equal(r.totalJP, 114);
  assert.equal(r.selisihDenganResmi, 114 - r.totalJPHitung);
});

test('render RPE menyajikan tujuh bagian dan tabel mingguan serta pekan non-efektif', () => {
  denganDomUji(() => {
    const rpe = hitungRpe({
      jpPerPekan: 5,
      hariPembelajaran: [1, 2, 3, 4, 5],
      ganjil: { mulai: '2026-08-03', selesai: '2026-08-14' },
      genap: { mulai: '2027-01-04', selesai: '2027-01-15' },
      kalender: [{ mulai: '2026-08-03', selesai: '2026-08-07', ket: 'Libur sekolah', efektif: false }]
    });
    const konteks = {
      mapel: 'Matematika',
      kelas: 'X',
      fase: 'E',
      tahunAjaran: '2026/2027',
      identitas: {}
    };
    const artikel = renderRpe(rpe, konteks);
    const bagian = artikel.querySelectorAll('section');
    const tabel = artikel.querySelectorAll('table');
    const tabelMingguan = tabel.find((item) => item.className.includes('tbl-rpe') &&
      !item.className.includes('non-efektif'));
    const tabelNonEfektif = tabel.find((item) => item.className.includes('tbl-rpe-non-efektif'));

    assert.equal(bagian.length, 7);
    assert.deepEqual(bagian.map((item) => item.children[0].textContent), [
      '1. Identitas',
      '2. Landasan penyusunan',
      '3. Landasan hitung',
      '4. Pekan efektif Semester Ganjil',
      '5. Pekan efektif Semester Genap',
      '6. Distribusi dan rekapitulasi',
      '7. Penutup dan pengesahan'
    ]);
    assert.equal(tabelMingguan.querySelectorAll('th').length, 7);
    assert.equal(tabelNonEfektif.querySelectorAll('th').length, 5);
    const pekanPertama = tabelMingguan.querySelectorAll('tr')[1].children.map((sel) => sel.textContent);
    assert.equal(pekanPertama[1], 'Agustus');
    assert.equal(pekanPertama[2], '2');
    assert.equal(pekanPertama[4], 'Tidak efektif');
    assert.equal(pekanPertama[5], '0');
    assert.match(tabelNonEfektif.textContent, /Libur sekolah/);
  });
});

/* ---------- Pembagian proporsional ---------- */
test('bagiProporsional: jumlah persis, minimum dihormati, deterministik', () => {
  for (const total of [10, 37, 104, 999]) {
    const out = bagiProporsional([3, 5, 7, 11, 2], total, 1);
    assert.equal(out.reduce((s, v) => s + v, 0), total);
    assert.ok(out.every((v) => v >= 1));
    assert.deepEqual(out, bagiProporsional([3, 5, 7, 11, 2], total, 1));
  }
  assert.deepEqual(bagiProporsional([], 10), []);
  assert.equal(bagiProporsional([0, 0, 0], 9).reduce((s, v) => s + v, 0), 9);
});

/* ---------- Anggaran & Selaras JP ---------- */
test('hitungAnggaran Prota mempertahankan UH per unit berdasarkan hari pembelajaran', () => {
  const a = hitungAnggaran(5, 114, 4, 2);
  assert.deepEqual(a, { ok: true, jpPertemuan: 2, uhTotal: 10, sisaTP: 104 });
});

test('hitungAnggaranAtp mengikuti mode legacy perUnit sebesar JP per pekan tiap unit', () => {
  const a = hitungAnggaranAtp(5, 114, 4);
  assert.deepEqual(a, { ok: true, jpPertemuan: 4, uhTotal: 20, sisaTP: 94 });
});

test('hitungAnggaranAtp: gagal dengan kode jelas', () => {
  assert.equal(hitungAnggaranAtp(5, 2, 4).alasan, 'TOTAL_JP_TERLALU_KECIL');
  assert.equal(hitungAnggaranAtp(0, 114, 4).alasan, 'TIDAK_ADA_UNIT');
  assert.equal(hitungAnggaranAtp(30, 40, 4).alasan, 'JP_TIDAK_CUKUP');
});

test('selaraskanJpAtp: Σ JP TP + Σ UH = Total JP tepat; kode/rumusan tak berubah; tidak memutasi', () => {
  const asli = buatAtp();
  const salinan = structuredClone(asli);
  const r = selaraskanJpAtp(asli, 114, 4);
  assert.ok(r.ok);
  assert.deepEqual(asli, salinan, 'masukan tidak boleh dimutasi');
  assert.notEqual(jumlahJpTp(asli), r.anggaran.sisaTP);
  const jpTp = jumlahJpTp(r.atp);
  assert.equal(jpTp, r.anggaran.sisaTP);
  assert.equal(jpTp + r.anggaran.uhTotal, 114);
  assert.deepEqual(ratakanTp(r.atp).map((t) => t.kode), ratakanTp(asli).map((t) => t.kode));
  assert.equal(ratakanTp(r.atp).length, 16);
});

test('rekapAtp = Prota: Bagian 5 dan 6 tidak mungkin berselisih', () => {
  const sel = selaraskanJpAtp(buatAtp(), 114, 4);
  const rekap = rekapAtp(sel.atp, sel.anggaran.jpPertemuan);
  const prota = hitungProta({ atp: sel.atp, totalJP: 114, jpPerPekan: 4, jumlahHari: 2 });
  assert.equal(rekap.total, 114);
  assert.equal(rekap.ganjil.subtotal, prota.program[1].jp);
  assert.equal(rekap.genap.subtotal, prota.program[2].jp);
});

/* ---------- Prota ---------- */
test('Prota: total semester = Total JP; tiap TP ≥ 1 JP; pekan berurutan tanpa lubang', () => {
  const sel = selaraskanJpAtp(buatAtp(), 114, 4);
  const p = hitungProta({ atp: sel.atp, totalJP: 114, jpPerPekan: 4, jumlahHari: 2 });
  assert.ok(p.ok);
  assert.equal(p.program[1].jp + p.program[2].jp, 114);
  assert.equal(p.jumlahModul, 5);
  for (const s of [1, 2]) {
    let kum = 0;
    for (const m of p.program[s].modul) {
      for (const b of m.baris) {
        assert.ok(b.jp >= 1);
        assert.equal(b.pekan.dari, Math.floor(kum / 4) + 1);
        kum += b.jp;
      }
      kum += m.uh;
    }
    assert.equal(kum, p.program[s].jp);
  }
});

test('Prota: semester dibelah menurut JP bila ATP tidak konsisten', () => {
  const atp = buatAtp();
  atp.unit.forEach((u) => { u.semester = 1; }); // semua Ganjil → tidak valid
  const sel = selaraskanJpAtp(atp, 114, 4);
  const p = hitungProta({ atp: sel.atp, totalJP: 114, jpPerPekan: 4, jumlahHari: 2 });
  assert.ok(p.program[1].modul.length > 0 && p.program[2].modul.length > 0);
  assert.equal(p.program[1].jp + p.program[2].jp, 114);
});

test('render Prota menyusun tujuh bagian dan seluruh rekap tetap sesuai Total JP', () => {
  denganDomUji(() => {
    const selaras = selaraskanJpAtp(buatAtp(), 114, 4);
    const prota = hitungProta({ atp: selaras.atp, totalJP: 114, jpPerPekan: 4, jumlahHari: 2 });
    const rpe = hitungRpe({ ...konteksDasar, totalJP: 114 });
    const konteks = {
      mapel: 'Matematika',
      kelas: 'X',
      fase: 'E',
      tahunAjaran: '2026/2027',
      identitas: {}
    };
    const artikel = renderProta(prota, konteks, rpe);
    const bagian = artikel.querySelectorAll('section');
    const tabel = artikel.querySelectorAll('table');
    const tabelDistribusi = tabel.find((item) => item.className.includes('tbl-prota-distribusi'));
    const tabelGanjil = tabel.find((item) => item.className === 'tbl tbl-prota' &&
      item.textContent.includes('Ulangan Harian Modul'));
    const tabelMatriks = tabel.find((item) => item.className.includes('tbl-prota-matriks'));
    const tabelRekap = tabel.find((item) => item.className.includes('tbl-prota-rekap'));

    assert.equal(bagian.length, 7);
    assert.deepEqual(bagian.map((item) => item.children[0].textContent), [
      '1. Informasi umum dan komponen program tahunan',
      '2. Distribusi alokasi waktu tahunan',
      '3. Program Semester Ganjil',
      '4. Program Semester Genap',
      '5. Matriks Program Tahunan',
      '6. Rekapitulasi alokasi waktu tahunan',
      '7. Catatan pelaksanaan dan tindak lanjut'
    ]);
    assert.equal(tabelDistribusi.querySelectorAll('thead')[0].querySelectorAll('th').length, 7);
    assert.equal(tabelGanjil.querySelectorAll('thead')[0].querySelectorAll('th').length, 8);
    assert.equal(tabelMatriks.querySelectorAll('thead')[0].querySelectorAll('th').length, 6);
    assert.match(tabelRekap.textContent, /114 JP/);
    assert.match(artikel.textContent, /PERLU KONFIRMASI/);

    const protaSatuSemester = hitungProta({
      atp: {
        unit: [{
          no: 1,
          nama: 'Bilangan',
          elemen: 'Bilangan',
          semester: 1,
          tp: [{ kode: 'E.1', rumusan: 'Mengenali bilangan.', materi: '', jp: 4 }]
        }]
      },
      totalJP: 20,
      jpPerPekan: 4,
      jumlahHari: 2
    });
    const artikelSatuSemester = renderProta(protaSatuSemester, konteks);
    assert.match(artikelSatuSemester.textContent, /Tidak ada modul teralokasi pada semester ini/);
    assert.match(artikelSatuSemester.textContent, /PERLU KONFIRMASI/);
  });
});

/* ---------- Prosem ---------- */
test('Prosem: JP terjadwal = JP Prota bila kapasitas cukup; STS/SAS ditandai', () => {
  const rpe = hitungRpe({ ...konteksDasar, totalJP: 114 });
  const sel = selaraskanJpAtp(buatAtp(), 114, 4);
  const prota = hitungProta({ atp: sel.atp, totalJP: 114, jpPerPekan: 4, jumlahHari: 2 });
  const prosem = hitungProsem({ rpe, prota });
  for (const [kunci, s] of [['ganjil', 1], ['genap', 2]]) {
    const sem = prosem[kunci];
    assert.equal(sem.kekuranganJP, 0);
    assert.equal(sem.jpTerjadwal, prota.program[s].jp);
    const semuaPekan = sem.bulan.flatMap((b) => b.pekan);
    assert.equal(semuaPekan.filter((p) => p.penanda === 'sas').length, 1);
    assert.equal(semuaPekan.filter((p) => p.penanda === 'sts').length, 1);
    const perPekan = semuaPekan.map((p) => p.segmen.reduce((x, g) => x + g.jp, 0));
    assert.ok(perPekan.every((j) => j <= 4), 'tidak ada pekan melebihi JP per pekan');
  }
});

test('Prosem: melaporkan kekurangan JP bila pekan efektif tidak cukup', () => {
  const rpe = hitungRpe({
    ...konteksDasar,
    kalender: [{ mulai: '2026-07-13', selesai: '2026-11-30', ket: 'Libur panjang', efektif: false }]
  });
  const sel = selaraskanJpAtp(buatAtp(), 114, 4);
  const prota = hitungProta({ atp: sel.atp, totalJP: 114, jpPerPekan: 4, jumlahHari: 2 });
  const prosem = hitungProsem({ rpe, prota });
  assert.ok(prosem.ganjil.kekuranganJP > 0);
  assert.equal(prosem.ganjil.jpTerjadwal + prosem.ganjil.kekuranganJP, prota.program[1].jp);
});

/* ---------- Validator ---------- */
const formDasar = () => ({
  mapel: 'Matematika', kelas: 'X', fase: 'e', tahunAjaran: '2026/2027',
  jpPerPekan: '4', totalJP: '114', hariPembelajaran: 'Senin, Kamis',
  ganjilMulai: '2026-07-13', ganjilSelesai: '2026-12-19',
  genapMulai: '2027-01-05', genapSelesai: '2027-06-19',
  guru: 'Maria', kalender: []
});

test('validasiKonteks: formulir sah lolos dan dinormalkan', () => {
  const v = validasiKonteks(formDasar());
  assert.equal(v.ok, true, JSON.stringify(v.galat));
  assert.equal(v.nilai.fase, 'E');
  assert.equal(v.nilai.jpPerPekan, 4);
  assert.deepEqual(v.nilai.hariPembelajaran, [1, 4]);
});

test('validasiKonteks: menangkap tanggal terbalik, TA salah, semester tumpang tindih, JP di luar batas', () => {
  const v = validasiKonteks({
    ...formDasar(), tahunAjaran: '2026/2028', jpPerPekan: '0',
    ganjilSelesai: '2026-06-01', genapMulai: '2026-07-20'
  });
  assert.equal(v.ok, false);
  assert.equal(v.galat.tahunAjaran, 'FORMAT_TAHUN_AJARAN');
  assert.equal(v.galat.jpPerPekan, 'JP_PER_PEKAN_DI_LUAR_BATAS');
  assert.equal(v.galat.ganjilSelesai, 'SELESAI_SEBELUM_MULAI');
});

test('validasiKonteks: karakter kontrol dibuang dari teks', () => {
  const v = validasiKonteks({ ...formDasar(), mapel: 'Mat\u0000ematika\n\n  Wajib' });
  assert.equal(v.nilai.mapel, 'Mat ematika Wajib');
});

test('validasiAtp: kode ganda, JP nol, semester salah terdeteksi', () => {
  const atp = buatAtp();
  atp.unit[1].tp[0].kode = atp.unit[0].tp[0].kode;
  atp.unit[0].tp[1].jp = 0;
  atp.unit[2].semester = 3;
  const v = validasiAtp(atp);
  assert.equal(v.ok, false);
  assert.ok(v.galat.some((g) => g.startsWith('KODE_TP_GANDA')));
  assert.ok(v.galat.some((g) => g.includes('JP_TIDAK_VALID')));
  assert.ok(v.galat.some((g) => g.includes('SEMESTER_TIDAK_VALID')));
  assert.equal(validasiAtp(buatAtp()).ok, true);
  assert.equal(validasiAtp({ unit: [] }).ok, false);
});

test('validasiAtp: unit harus merujuk elemen CP kanonis', () => {
  const atp = buatAtp();
  atp.unit[0].elemen = 'Elemen yang tidak ada';
  const v = validasiAtp(atp);
  assert.equal(v.ok, false);
  assert.ok(v.galat.includes('UNIT_ELEMEN_CP_TIDAK_VALID'));

  const tanpaCp = buatAtp();
  tanpaCp.cp = [];
  assert.ok(validasiAtp(tanpaCp).galat.includes('ATP_TANPA_CP'));
});
