/**
 * @file Halaman detail satu paket perencanaan: tab RPE → CP → ATP → Prota → Prosem → KKTP → Modul.
 *
 * Prinsip:
 *  - Dokumen mesin dihitung di peramban; draf AI memakai model lokal atau provider eksternal
 *    setelah persetujuan eksplisit dan tetap harus ditinjau guru.
 *    Dokumen turunan otomatis ditandai "usang" bila induknya berubah (rev).
 *  - Tidak ada innerHTML. Semua isi paket dienkripsi sebelum ditulis ke Google Drive.
 *  - Tab mengikuti pola WAI-ARIA (panah kiri/kanan, Home/End).
 */

import { h, kosongkan, toast, konfirmasi } from './dom.js';
import { t } from '../i18n/index.js';
import { JENIS, URUTAN_DOKUMEN, PRASYARAT, STATUS, SUMBER, DOKUMEN_AI } from '../constants.js';
import { hitungRpe } from '../engine/rpe.js';
import { hitungProta, hitungAnggaran, normKode, ratakanTp, selaraskanJpAtp } from '../engine/prota.js';
import { hitungProsem } from '../engine/prosem.js';
import { validasiAtp } from '../engine/validator.js';
import { parsePlanningOutput } from '../../../services/planningAiSchema.js';
import { generateBrowserPlanning } from '../../../services/browserAi.js';
import { promptAtp, promptKktp, promptModul } from '../../../services/planningAiPrompts.js';
import {
  berikanAksesPaket, cabutAksesPaket, dengarPaket, dengarDokumen, dengarModul,
  simpanDokumen, simpanModul, simpanTinjauanDokumen, simpanTinjauanModul, perbaruiPaket
} from '../services/repository.js';
import { daftarAdminKunciTenant } from '../../../services/encryptionKeyDirectory.js';
import { muatKopSekolah } from '../../../services/schoolLetterhead.js';
import { getState } from '../../../state.js';
import { renderRpe } from './render/rpe.js';
import { renderCp } from './render/cp.js';
import { renderAtp } from './render/atp.js';
import { renderProta, renderProsem } from './render/prota-prosem.js';
import { renderKktp, renderModul } from './render/kktp-modul.js';
import { peringatan } from './render/umum.js';
import { buatAtpEditor } from './atp-editor.js';
import { buatKktpEditor } from './kktp-editor.js';
import { buatModulEditor } from './modul-editor.js';
import { bukaFormPaket } from './form-paket.js';
import { sesiGoogleWorkspacePerPengguna } from '../../../services/googleWorkspaceAuth.js';
import {
  bukaPemilihPdfCapaianDrive,
  unduhPdfCapaianDrive,
} from '../../../services/googleWorkspace.js';

/** Orientasi kertas saat cetak per jenis dokumen. */
const ORIENTASI = Object.freeze({
  [JENIS.RPE]: 'portrait', [JENIS.CP]: 'portrait', [JENIS.ATP]: 'landscape', [JENIS.PROTA]: 'portrait',
  [JENIS.PROSEM]: 'landscape', [JENIS.KKTP]: 'portrait', [JENIS.MODUL]: 'portrait'
});

const kodeGalat = (e) => e?.kode
  ?? (e?.code === 'permission-denied' ? 'AKSES_DITOLAK' : e?.code === 'unavailable' ? 'JARINGAN' : 'UMUM');

/**
 * @param {HTMLElement} wadah elemen tempat konten (sudah di dalam kerangka aplikasi)
 * @param {{uid:string, tenantId:string, paketId:string, jenis?:string}} p
 * @returns {() => void} fungsi pembersih
 */
export function halamanDetail(wadah, {
  uid, tenantId, paketId, jenis: tabAwal, search = '', canEditPackage = false,
  canGenerateDocuments = true, canGenerateAi = false, routeBase = '#/perencanaan', guruUid = ''
}) {
  const queryGuru = guruUid ? `guru=${encodeURIComponent(guruUid)}` : '';
  const urlPaket = (jenis, query = '') => {
    const params = [queryGuru, query.replace(/^\?/, '')].filter(Boolean).join('&');
    return `${routeBase}/${paketId}${jenis ? `/${jenis}` : ''}${params ? `?${params}` : ''}`;
  };
  const urlDaftar = `${routeBase}${guruUid ? `?guru=${encodeURIComponent(guruUid)}` : ''}`;
  /** @type {any} */ let paket = null;
  let kopDataUrl = '';
  let dokumen = {};
  let modul = {};
  let tab = URUTAN_DOKUMEN.includes(tabAwal) ? tabAwal : JENIS.RPE;
  const unitDariUrl = Number(new URLSearchParams(search).get('unit'));
  let unitModulAktif = Number.isInteger(unitDariUrl) && unitDariUrl >= 1 && unitDariUrl <= 30
    ? unitDariUrl
    : 1;
  const sibuk = new Set();
  let editor = null;       // { el, ambil } untuk ATP, KKTP, atau Modul Ajar
  let editorJenis = null;
  let editorKotor = false;
  let tinjauKey = '';
  let tinjauDraf = null;
  let dimuat = { paket: false, dokumen: false, modul: false };
  let adminTenant = null;
  const pemilikPaket = getState().user?.uid === uid;

  const konteksDenganKop = (value) => value ? {
    ...value,
    identitas: { ...(value.identitas || {}), kopDataUrl },
  } : value;

  const akar = h('div', { class: 'perencanaan-detail' });
  wadah.append(akar);

  /* ------------------------------ Turunan data ------------------------------ */

  const rev = (jenis) => dokumen[jenis]?.rev ?? null;

  /** Rev dependensi saat ini; null bila ada dependensi yang belum ada. */
  function depRev(jenis) {
    if (jenis === JENIS.RPE) return { paket: paket.rev };
    const dep = {};
    const daftar = jenis === JENIS.PROSEM ? [JENIS.PROTA, JENIS.RPE] : PRASYARAT[jenis];
    for (const d of daftar) {
      if (rev(d) === null) return null;
      dep[d] = rev(d);
    }
    return dep;
  }

  const statusDok = (jenis, dok = dokumen[jenis]) => {
    if (!dok) return STATUS.BELUM;
    const dep = depRev(jenis);
    if (!dep) return STATUS.USANG;
    return Object.entries(dep).every(([k, v]) => dok.sumberRev?.[k] === v) ? STATUS.SIAP : STATUS.USANG;
  };

  /** Daftar prasyarat yang belum siap (kosong = boleh dikerjakan). */
  const prasyaratKurang = (jenis) => PRASYARAT[jenis].filter((p) => statusDok(p) !== STATUS.SIAP);

  const unitAtp = () => (dokumen[JENIS.ATP]?.payload?.unit ?? []).filter((u) => u.tp?.length);

  function statusModul() {
    const unit = unitAtp();
    if (!unit.length) return { status: STATUS.BELUM, siap: 0, total: 0 };
    const dep = depRev(JENIS.MODUL);
    const siap = unit.filter((u) => {
      const d = modul[String(u.no)];
      return d && dep && Object.entries(dep).every(([k, v]) => d.sumberRev?.[k] === v);
    }).length;
    const ada = unit.filter((u) => modul[String(u.no)]).length;
    return { status: ada === 0 ? STATUS.BELUM : siap === unit.length ? STATUS.SIAP : STATUS.USANG, siap, total: unit.length };
  }

  const statusTab = (jenis) => (jenis === JENIS.MODUL ? statusModul().status : statusDok(jenis));

  /* ------------------------------ Aksi ------------------------------ */

  const tandaiSibuk = async (kunci, fn) => {
    if (sibuk.has(kunci)) return;
    sibuk.add(kunci);
    gambar();
    try { await fn(); } catch (e) {
      if (e?.name === 'AbortError') toast(t('umum.dibatalkan'));
      else if (String(kunci).startsWith('ai:')) toast(e?.message || t(`galat.${kodeGalat(e)}`), 'galat');
      else toast(t(`galat.${kodeGalat(e)}`), 'galat');
    } finally { sibuk.delete(kunci); gambar(); }
  };

  const konfirmasiTimpa = async (jenis) => {
    const ada = jenis === JENIS.MODUL ? false : !!dokumen[jenis];
    return !ada || konfirmasi(t('umum.konfirmasiTimpa'), { ya: t('umum.timpa'), bahaya: true });
  };

  const simpan = (jenis, payload, sumber) => simpanDokumen({
    uid, tenantId, paketId, jenis, payload, sumber, sumberRev: depRev(jenis), revDasar: rev(jenis) ?? 0
  });

  const konteksMesin = () => ({
    jpPerPekan: paket.jpPerPekan, hariPembelajaran: paket.hariPembelajaran, ganjil: paket.ganjil,
    genap: paket.genap, kalender: paket.kalender, totalJP: paket.totalJP
  });

  const aksi = {
    [JENIS.RPE]: () => tandaiSibuk(JENIS.RPE, async () => {
      if (!(await konfirmasiTimpa(JENIS.RPE))) return;
      await simpan(JENIS.RPE, hitungRpe(konteksMesin()), SUMBER.MESIN);
      toast(t('umum.berhasilHitung'), 'sukses');
    }),

    [JENIS.CP]: () => tandaiSibuk(JENIS.CP, async () => {
      if (!(await konfirmasiTimpa(JENIS.CP))) return;
      const sesi = sesiGoogleWorkspacePerPengguna(uid);
      if (!sesi?.accessToken) throw new Error('Hubungkan Google Drive sebelum mengimpor CP.');
      const selected = await bukaPemilihPdfCapaianDrive(sesi.accessToken);
      if (!selected) return;
      const source = await unduhPdfCapaianDrive(sesi.accessToken, selected.id);
      try {
        if (source.name !== selected.name) {
          throw new Error('Nama PDF berubah setelah dipilih. Pilih kembali sumber CP.');
        }
        const { bacaCapaianDariPdf } = await import('../engine/capaianPembelajaranPdf.js');
        const draft = await bacaCapaianDariPdf(source.bytes, {
          mapel: paket.mapel,
          fase: paket.fase,
          fileName: source.name,
          sourceFileId: source.id,
        });
        await simpan(JENIS.CP, draft, SUMBER.MANUAL);
        toast(t('cp.berhasil'), 'sukses');
      } finally {
        source.bytes.fill(0);
      }
    }),

    [JENIS.ATP]: () => {
      mulaiEditorAtp();
      gambar();
    },

    [JENIS.PROTA]: () => tandaiSibuk(JENIS.PROTA, async () => {
      if (!(await konfirmasiTimpa(JENIS.PROTA))) return;
      const rpe = dokumen[JENIS.RPE].payload;
      const hasil = hitungProta({ atp: dokumen[JENIS.ATP].payload, totalJP: rpe.totalJP, jpPerPekan: rpe.jpPerPekan, jumlahHari: rpe.hari.length });
      if (!hasil.ok) throw Object.assign(new Error(hasil.alasan), { kode: hasil.alasan });
      await simpan(JENIS.PROTA, hasil, SUMBER.MESIN);
      toast(t('umum.berhasilHitung'), 'sukses');
    }),

    [JENIS.PROSEM]: () => tandaiSibuk(JENIS.PROSEM, async () => {
      if (!(await konfirmasiTimpa(JENIS.PROSEM))) return;
      const hasil = hitungProsem({ rpe: dokumen[JENIS.RPE].payload, prota: dokumen[JENIS.PROTA].payload });
      await simpan(JENIS.PROSEM, hasil, SUMBER.MESIN);
      toast(t('umum.berhasilHitung'), 'sukses');
    }),

  };

  function promptPerencanaan(jenis, unit) {
    const konteks = {
      jenjang: paket.jenjang,
      mapel: paket.mapel,
      kelas: paket.kelas,
      fase: paket.fase,
    };
    if (jenis === JENIS.ATP) {
      const rpe = dokumen[JENIS.RPE].payload;
      return promptAtp({
        ...konteks,
        cp: dokumen[JENIS.CP].payload.cp,
        totalJP: rpe.totalJP,
        jpPerPekan: rpe.jpPerPekan,
      });
    }
    if (jenis === JENIS.KKTP) {
      return promptKktp({
        ...konteks,
        tps: ratakanTp(dokumen[JENIS.ATP].payload),
      });
    }
    const alokasi = dokumen[JENIS.PROTA].payload.program?.[unit.semester]?.modul
      ?.find((entry) => entry.no === unit.no);
    const jumlahHari = Math.max(1, paket.hariPembelajaran?.length ?? 1);
    return promptModul({
      ...konteks,
      unit,
      jpUnit: alokasi?.jp ?? unit.tp.reduce((total, tp) => total + tp.jp, 0),
      jpPerPertemuan: Math.max(1, Math.round(paket.jpPerPekan / jumlahHari)),
    });
  }

  async function buatDrafAi(jenis, mode = 'ai-nnoe', unit = null) {
    return tandaiSibuk(`ai:${jenis}`, async () => {
      if (!canGenerateAi) throw new Error('Generator AI dinonaktifkan oleh administrator platform.');
      const existing = jenis === JENIS.MODUL ? modul[String(unit?.no)] : dokumen[jenis];
      if (existing && !(await konfirmasi(
        jenis === JENIS.MODUL
          ? 'Timpa draf Modul Ajar untuk unit ini?'
          : t('umum.konfirmasiTimpa'),
        { ya: t('umum.timpa'), bahaya: true },
      ))) return;
      if (mode === 'ai-eksternal' &&
          !(await konfirmasi(
            'Konteks kurikulum dan CP yang Anda impor akan dikirim ke provider API pilihan. Provider dapat mengenakan biaya sesuai kebijakan mereka. Jangan lanjutkan jika paket memuat data pribadi.',
            { ya: 'Kirim ke AI eksternal', bahaya: true },
          ))) return;

      const result = await generateBrowserPlanning({
        uid,
        paketId,
        jenis,
        noUnit: unit?.no,
        prompt: promptPerencanaan(jenis, unit),
        maxTokens: 3000,
        mode,
        externalAcknowledged: mode === 'ai-eksternal',
      });

      if (jenis === JENIS.ATP) {
        const cp = dokumen[JENIS.CP].payload.cp;
        const payload = parsePlanningOutput('atp', result.answer, { cp });
        const validasi = validasiAtp(payload);
        if (!validasi.ok) throw new Error(`Draf ATP tidak valid: ${validasi.galat.slice(0, 3).join(', ')}.`);
        const rpe = dokumen[JENIS.RPE].payload;
        const selaras = selaraskanJpAtp(payload, rpe.totalJP, rpe.jpPerPekan, rpe.hari.length);
        if (!selaras.ok) throw new Error(`Draf ATP tidak dapat diselaraskan: ${selaras.alasan}.`);
        await simpan(JENIS.ATP, {
          ...selaras.atp,
          anggaran: {
            jpPertemuan: selaras.anggaran.jpPertemuan,
            uhTotal: selaras.anggaran.uhTotal,
            sisaTP: selaras.anggaran.sisaTP,
          },
          totalJP: rpe.totalJP,
        }, SUMBER.AI);
      } else if (jenis === JENIS.KKTP) {
        const codes = ratakanTp(dokumen[JENIS.ATP].payload).map((tp) => normKode(tp.kode));
        const payload = parsePlanningOutput('kktp', result.answer, { kodeTp: codes });
        await simpan(JENIS.KKTP, payload, SUMBER.AI);
      } else {
        const codes = unit.tp.map((tp) => normKode(tp.kode));
        const payload = parsePlanningOutput('modul', result.answer, { kodeTp: codes });
        await simpanModul({
          uid,
          tenantId,
          paketId,
          noUnit: unit.no,
          payload,
          sumber: SUMBER.AI,
          sumberRev: depRev(JENIS.MODUL),
          revDasar: modul[String(unit.no)]?.rev ?? 0,
        });
      }
      toast(t('detail.aiBerhasil'), 'sukses');
    });
  }

  function tombolAi(jenis, unit = null) {
    return h('div', { class: 'bilah-aksi no-print' },
      h('button', {
        type: 'button',
        class: 'tombol',
        disabled: sibuk.size > 0 || !canGenerateAi,
        onClick: () => buatDrafAi(jenis, 'ai-nnoe', unit),
      }, t('detail.aiLokal')),
      h('button', {
        type: 'button',
        class: 'tombol tombol-sekunder',
        disabled: sibuk.size > 0 || !canGenerateAi,
        onClick: () => buatDrafAi(jenis, 'ai-eksternal', unit),
      }, t('detail.aiEksternal')));
  }

  async function simpanAtpManual() {
    const draft = editor.ambil();
    const v = validasiAtp(draft);
    if (!v.ok) {
      toast(`${t('atpEditor.tidakValid')}: ${v.galat.slice(0, 3).map((kode) => t(`galat.${kode}`)).join(' ')}`, 'galat');
      return;
    }
    const rpe = dokumen[JENIS.RPE].payload;
    const ang = hitungAnggaran(draft.unit.filter((u) => u.tp.length).length, rpe.totalJP, rpe.jpPerPekan, rpe.hari.length);
    if (!ang.ok) { toast(t(`galat.${ang.alasan}`), 'galat'); return; }
    await tandaiSibuk('atp-simpan', async () => {
      const lama = dokumen[JENIS.ATP];
      await simpanDokumen({
        uid, tenantId, paketId, jenis: JENIS.ATP,
        payload: { ...draft, anggaran: { jpPertemuan: ang.jpPertemuan, uhTotal: ang.uhTotal, sisaTP: ang.sisaTP }, totalJP: rpe.totalJP },
        sumber: SUMBER.MANUAL, sumberRev: depRev(JENIS.ATP), revDasar: lama?.rev ?? 0
      });
      editor = null; editorJenis = null; editorKotor = false;
      toast(t('atpEditor.tersimpan'), 'sukses');
    });
  }

  function mulaiEditorKktp() {
    const lama = dokumen[JENIS.KKTP]?.payload;
    editor = buatKktpEditor(dokumen[JENIS.ATP].payload, lama, () => {
      editorKotor = true;
      perbaruiTombolSimpanManual();
    });
    editorJenis = JENIS.KKTP;
    editorKotor = false;
  }

  function mulaiEditorModul(unit) {
    const lama = modul[String(unit.no)]?.payload;
    editor = buatModulEditor(unit, lama, () => {
      editorKotor = true;
      perbaruiTombolSimpanManual();
    });
    editorJenis = JENIS.MODUL;
    editorKotor = false;
  }

  let tombolSimpanManual = null;
  function perbaruiTombolSimpanManual() {
    if (tombolSimpanManual) tombolSimpanManual.disabled = !editorKotor || sibuk.has('dokumen-manual-simpan');
  }

  async function batalEditorManual() {
    if (editorKotor && !(await konfirmasi(t('atpEditor.buangPerubahan'), { bahaya: true }))) return;
    editor = null;
    editorJenis = null;
    editorKotor = false;
    gambar();
  }

  function kontrolEditorManual(simpanHandler) {
    tombolSimpanManual = h('button', {
      type: 'button',
      class: 'tombol',
      disabled: !editorKotor || sibuk.has('dokumen-manual-simpan'),
      onClick: simpanHandler,
    }, t('atpEditor.simpanSemua'));
    return h('div', { class: 'bilah-aksi no-print' },
      tombolSimpanManual,
      h('button', {
        type: 'button', class: 'tombol tombol-sekunder', onClick: batalEditorManual,
      }, t('atpEditor.selesai')));
  }

  async function simpanKktpManual() {
    let payload;
    try {
      const draft = editor.ambil();
      const codes = dokumen[JENIS.ATP].payload.unit.flatMap((unit) => unit.tp.map((tp) => normKode(tp.kode)));
      payload = parsePlanningOutput('kktp', JSON.stringify(draft), { kodeTp: codes });
    } catch (error) {
      toast(`Periksa isian KKTP: ${error.message}`, 'galat');
      return;
    }
    await tandaiSibuk('dokumen-manual-simpan', async () => {
      await simpan(JENIS.KKTP, payload, SUMBER.MANUAL);
      editor = null; editorJenis = null; editorKotor = false;
      toast(t('atpEditor.tersimpan'), 'sukses');
    });
  }

  async function simpanModulManual(unit) {
    let payload;
    try {
      const draft = editor.ambil();
      const codes = unit.tp.map((tp) => normKode(tp.kode));
      payload = parsePlanningOutput('modul', JSON.stringify(draft), { kodeTp: codes, allowEmptyLists: true });
    } catch (error) {
      toast(`Periksa isian Modul Ajar: ${error.message}`, 'galat');
      return;
    }
    await tandaiSibuk('dokumen-manual-simpan', async () => {
      await simpanModul({
        uid, tenantId, paketId, noUnit: unit.no, payload, sumber: SUMBER.MANUAL,
        sumberRev: depRev(JENIS.MODUL), revDasar: modul[String(unit.no)]?.rev ?? 0,
      });
      editor = null; editorJenis = null; editorKotor = false;
      toast(t('atpEditor.tersimpan'), 'sukses');
    });
  }

  function ubahKonteks() {
    bukaFormPaket({
      judul: t('detail.ubahKonteks'),
      awal: paket,
      onSimpan: async (konteks) => {
        await perbaruiPaket({ uid, paketId, konteks, revDasar: paket.rev });
        toast(t('detail.konteksTersimpan'), 'sukses');
      },
    });
  }

  async function muatAdminTenant() {
    if (adminTenant !== null || !pemilikPaket) return;
    try {
      adminTenant = await daftarAdminKunciTenant(tenantId);
      gambar();
    } catch (error) {
      toast(t(`galat.${kodeGalat(error)}`), 'galat');
    }
  }

  function panelAkses() {
    if (!pemilikPaket || !paket) return null;
    const grants = paket.grants || [];
    const tersedia = (adminTenant || []).filter((admin) =>
      !grants.some((grant) => grant.userId === admin.id));
    return h('section', { class: 'kotak kotak-info no-print', 'aria-label': 'Akses paket perencanaan' },
      h('h3', null, 'Akses admin sekolah'),
      h('p', null, 'Hanya admin yang Anda pilih yang dapat membuka paket ini. Izin memberi akses baca; salinan yang sudah dibuka admin tidak dapat ditarik kembali.'),
      adminTenant === null
        ? h('button', {
          type: 'button',
          class: 'tombol tombol-sekunder',
          onClick: muatAdminTenant,
        }, 'Muat admin sekolah')
        : null,
      adminTenant?.length
        ? h('div', { class: 'bilah-aksi' },
          h('label', null, 'Admin sekolah ',
            h('select', { id: 'planning-admin-access', class: 'input' },
              tersedia.map((admin) => h('option', { value: admin.id }, admin.nama || admin.email)))),
          h('button', {
            type: 'button',
            class: 'tombol tombol-sekunder',
            disabled: tersedia.length === 0,
            onClick: async () => {
              const adminId = akar.querySelector('#planning-admin-access')?.value;
              if (!adminId) return;
              await tandaiSibuk('akses', async () => {
                await berikanAksesPaket({ uid, tenantId, paketId, adminId });
                toast('Akses baca diberikan. Admin perlu menghubungkan Drive, membuka kunci vault, lalu memilih paket ini di Google Picker.', 'sukses');
              });
            },
          }, 'Berikan akses baca'))
        : adminTenant?.length === 0 ? h('p', null, 'Belum ada admin sekolah aktif yang dapat diberi akses.') : null,
      grants.length
        ? h('ul', null, grants.map((grant) => h('li', null,
          `${grant.email} — akses baca `,
          h('button', {
            type: 'button',
            class: 'tombol tombol-bahaya tombol-kecil',
            onClick: async () => {
              if (!(await konfirmasi(
                `Cabut akses ${grant.email}? Salinan yang sudah dibuka sebelumnya tidak dapat ditarik kembali.`,
                { ya: 'Cabut akses', bahaya: true },
              ))) return;
              await tandaiSibuk(`cabut:${grant.userId}`, async () => {
                await cabutAksesPaket({ uid, tenantId, paketId, adminId: grant.userId });
                toast('Key-envelope dicabut dan izin Drive dihapus.', 'sukses');
              });
            },
          }, 'Cabut'))))
        : h('p', null, 'Belum ada admin yang diberi akses.'),
    );
  }

  function cetak() {
    const gaya = h('style', { id: 'ainnoe-halaman' }, `@page{size:A4 ${ORIENTASI[tab]};margin:15mm 15mm 15mm 20mm}`);
    document.head.append(gaya);
    const bersih = () => { gaya.remove(); window.removeEventListener('afterprint', bersih); };
    window.addEventListener('afterprint', bersih);
    toast('Pilih “Simpan sebagai PDF” untuk mengunduh tanpa watermark. PDF tidak dapat dijamin kebal konversi pihak ketiga.', 'info');
    window.print();
  }

  function elemenTinjauan(root) {
    const urutan = new Map();
    return [...root.querySelectorAll('h1,h2,h3,p,li,td,th,caption')]
      .filter((el) => !el.closest('[data-review-locked="true"]') && el.textContent.trim())
      .map((el) => {
        const tag = el.tagName.toLowerCase();
        const no = urutan.get(tag) || 0;
        urutan.set(tag, no + 1);
        const key = `${tag}:${no}`;
        el.dataset.reviewKey = key;
        return [key, el];
      });
  }

  function terapkanTinjauan(root, record, key) {
    if (!root || !record) return root;
    const edits = tinjauKey === key && tinjauDraf
      ? tinjauDraf
      : (record.reviewEdits || {});
    const elements = elemenTinjauan(root);
    elements.forEach(([id, el]) => {
      if (Object.hasOwn(edits, id)) {
        el.textContent = edits[id];
        el.classList.add('teks-tinjauan');
      }
      if (tinjauKey === key) {
        el.contentEditable = 'true';
        el.classList.add('review-editable');
      }
    });
    if (tinjauKey === key) {
      root.addEventListener('input', () => {
        tinjauDraf = Object.fromEntries(elements.map(([id, el]) => [id, el.innerText]));
      });
    }
    return root;
  }

  function kontrolTinjauan(record, jenis, noUnit) {
    if (!record || !canGenerateDocuments) return null;
    const key = noUnit ? `modul:${noUnit}` : jenis;
    if (tinjauKey !== key) {
      return h('button', {
        type: 'button',
        class: 'tombol tombol-sekunder',
        disabled: sibuk.size > 0,
        onClick: () => {
          tinjauKey = key;
          tinjauDraf = { ...(record.reviewEdits || {}) };
          gambar();
        },
      }, 'Tinjau dan edit');
    }
    return h('div', { class: 'bilah-aksi no-print' },
      h('button', {
        type: 'button',
        class: 'tombol',
        disabled: sibuk.size > 0,
        onClick: async () => {
          const reviewEdits = tinjauDraf || {};
          await tandaiSibuk(`review:${key}`, async () => {
            if (noUnit) {
              await simpanTinjauanModul({
                uid, tenantId, paketId, noUnit, reviewEdits, revDasar: record.rev,
              });
            } else {
              await simpanTinjauanDokumen({
                uid, tenantId, paketId, jenis, reviewEdits, revDasar: record.rev,
              });
            }
            record.reviewEdits = reviewEdits;
            tinjauKey = '';
            tinjauDraf = null;
            toast('Tinjauan dokumen berhasil disimpan.', 'sukses');
          });
        },
      }, 'Simpan tinjauan'),
      h('button', {
        type: 'button',
        class: 'tombol tombol-sekunder',
        disabled: sibuk.size > 0,
        onClick: () => {
          tinjauKey = '';
          tinjauDraf = null;
          gambar();
        },
      }, 'Batalkan'));
  }

  /* ------------------------------ Tampilan ------------------------------ */

  const lencana = (status, tambahan = '') => h('span', { class: `lencana lencana-${status}` },
    t(`status.${status}`), tambahan ? ` ${tambahan}` : '');

  function tombolAksi(jenis) {
    const kurang = prasyaratKurang(jenis);
    const bekerja = sibuk.has(jenis);
    const status = statusDok(jenis);
    const ai = DOKUMEN_AI.includes(jenis);
    const label = jenis === JENIS.CP
      ? (bekerja ? t('cp.memuat') : t('cp.impor'))
      : bekerja ? (ai ? t('umum.membuat') : t('umum.menghitung'))
      : status === STATUS.BELUM ? (ai ? t('umum.buatAi') : t('umum.hitung'))
        : (ai ? t('umum.buatUlangAi') : t('umum.hitungUlang'));
    return h('button', {
      type: 'button', class: 'tombol', disabled: kurang.length > 0 || bekerja || (sibuk.size > 0 && !bekerja),
      'aria-busy': bekerja ? 'true' : null, onClick: aksi[jenis]
    }, label);
  }

  function panelUmum(jenis, isiDokumen, kosong = null) {
    const kurang = prasyaratKurang(jenis);
    const status = statusDok(jenis);
    const dok = dokumen[jenis];

    const bilah = h('div', { class: 'bilah-aksi no-print' },
      canGenerateDocuments && !DOKUMEN_AI.includes(jenis) ? tombolAksi(jenis) : null,
      canGenerateDocuments && jenis === JENIS.ATP && dok && status !== STATUS.BELUM && !editor
        ? h('button', { type: 'button', class: 'tombol tombol-sekunder', disabled: sibuk.size > 0, onClick: () => { mulaiEditorAtp(); gambar(); } }, t('atpEditor.mulai')) : null,
      kontrolTinjauan(dok, jenis),
      dok ? h('button', { type: 'button', class: 'tombol tombol-sekunder', onClick: cetak }, 'Unduh PDF') : null,
      dok ? h('span', { class: 'meta' }, t('detail.sumber', { sumber: t(`sumber.${dok.sumber}`) })) : null);

    return h('div', null,
      !canGenerateDocuments ? h('p', { class: 'kotak kotak-info no-print', role: 'note' }, t('detail.dokumenKhususGuru')) : null,
      bilah,
      DOKUMEN_AI.includes(jenis) ? h('p', { class: 'kotak kotak-info no-print', role: 'note' }, t('detail.aiNonaktif')) : null,
      kurang.length ? peringatan(t('detail.prasyarat', { daftar: kurang.map((k) => t(`dok.${k}`)).join(', ') })) : null,
      status === STATUS.USANG && dok ? peringatan(t('detail.usang')) : null,
      dok ? terapkanTinjauan(isiDokumen, dok, jenis)
        : (kurang.length ? null : kosong ?? h('p', { class: 'kosong' }, t('detail.belumAda'))));
  }

  function mulaiEditorAtp() {
    const rpe = dokumen[JENIS.RPE].payload;
    const cp = dokumen[JENIS.CP].payload.cp;
    editorKotor = false;
    editor = buatAtpEditor({
      atp: { ...(dokumen[JENIS.ATP]?.payload ?? { unit: [] }), cp },
      totalJP: rpe.totalJP, jpPerPekan: rpe.jpPerPekan, jumlahHari: rpe.hari.length,
      onChange: () => { editorKotor = true; perbaruiTombolSimpan(); }
    });
    editorJenis = JENIS.ATP;
  }

  let tombolSimpanAtp = null;
  const perbaruiTombolSimpan = () => { if (tombolSimpanAtp) tombolSimpanAtp.disabled = !editorKotor || sibuk.has('atp-simpan'); };

  function panelAtp() {
    const dok = dokumen[JENIS.ATP];
    if (editorJenis === JENIS.ATP) {
      tombolSimpanAtp = h('button', {
        type: 'button',
        class: 'tombol',
        disabled: !editorKotor || sibuk.has('atp-simpan'),
        onClick: simpanAtpManual,
      }, t('atpEditor.simpanSemua'));
      return h('div', null,
        h('div', { class: 'bilah-aksi no-print' }, tombolSimpanAtp,
          h('button', { type: 'button', class: 'tombol tombol-sekunder', onClick: async () => {
            if (editorKotor && !(await konfirmasi(t('atpEditor.buangPerubahan'), { bahaya: true }))) return;
            editor = null; editorJenis = null; editorKotor = false; gambar();
          } }, t('atpEditor.selesai'))),
        editor.el);
    }
    const kurang = prasyaratKurang(JENIS.ATP);
    return h('div', null,
      !canGenerateDocuments ? h('p', { class: 'kotak kotak-info no-print', role: 'note' }, t('detail.dokumenKhususGuru')) : null,
      canGenerateDocuments && canGenerateAi ? h('p', { class: 'kotak kotak-info no-print', role: 'note' }, t('detail.aiTinjau')) : null,
      canGenerateDocuments && canGenerateAi && !kurang.length ? tombolAi(JENIS.ATP) : null,
      canGenerateDocuments && !canGenerateAi ? h('p', { class: 'kotak kotak-info no-print', role: 'note' }, t('detail.aiDiblokir')) : null,
      h('div', { class: 'bilah-aksi no-print' },
        canGenerateDocuments ? h('button', {
          type: 'button',
          class: 'tombol',
          disabled: kurang.length > 0 || sibuk.size > 0,
          onClick: aksi[JENIS.ATP],
        }, dok ? t('atpEditor.mulai') : t('atpEditor.susun')) : null,
        kontrolTinjauan(dok, JENIS.ATP),
        dok ? h('button', { type: 'button', class: 'tombol tombol-sekunder', onClick: cetak }, 'Unduh PDF') : null,
        dok ? h('span', { class: 'meta' }, t('detail.sumber', { sumber: t(`sumber.${dok.sumber}`) })) : null),
      kurang.length ? peringatan(t('detail.prasyarat', { daftar: kurang.map((k) => t(`dok.${k}`)).join(', ') })) : null,
      statusDok(JENIS.ATP) === STATUS.USANG && dok ? peringatan(t('detail.usang')) : null,
      dok ? terapkanTinjauan(renderAtp(dok.payload, paket), dok, JENIS.ATP)
        : kurang.length ? null : h('p', { class: 'kosong' }, t('atpEditor.drafKosong')));
  }

  function panelCp() {
    const intro = h('div', null,
      h('p', { class: 'kotak kotak-info' }, t('cp.pilihSumber')),
      h('p', { class: 'kotak kotak-info', role: 'note' }, t('cp.peringatan')),
      h('p', { class: 'hint' }, t('cp.panduanResmi')),
      h('ul', { class: 'tautan-rujukan-kalender' },
        h('li', null, h('a', {
          href: 'https://kurikulum.kemendikdasmen.go.id/rujukan',
          target: '_blank',
          rel: 'noopener noreferrer',
        }, 'Rujukan resmi kurikulum')),
        h('li', null, h('a', {
          href: 'https://kurikulum.kemendikdasmen.go.id/panduan-mapel',
          target: '_blank',
          rel: 'noopener noreferrer',
        }, 'Panduan Mata Pelajaran'))));
    const dok = dokumen[JENIS.CP];
    return panelUmum(
      JENIS.CP,
      dok ? renderCp(dok.payload, paket) : null,
      intro,
    );
  }

  function panelKktp() {
    const dok = dokumen[JENIS.KKTP];
    const kurang = prasyaratKurang(JENIS.KKTP);
    if (editorJenis === JENIS.KKTP) {
      return h('div', null,
        kontrolEditorManual(simpanKktpManual),
        editor.el);
    }
    return h('div', null,
      !canGenerateDocuments ? h('p', { class: 'kotak kotak-info no-print', role: 'note' }, t('detail.dokumenKhususGuru')) : null,
      h('p', { class: 'kotak kotak-info no-print', role: 'note' }, t(canGenerateAi ? 'detail.aiTinjau' : 'detail.manualGratis')),
      canGenerateDocuments && canGenerateAi && !kurang.length ? tombolAi(JENIS.KKTP) : null,
      canGenerateDocuments && !canGenerateAi ? h('p', { class: 'kotak kotak-info no-print', role: 'note' }, t('detail.aiDiblokir')) : null,
      h('div', { class: 'bilah-aksi no-print' },
        canGenerateDocuments && !kurang.length ? h('button', {
          type: 'button', class: 'tombol', disabled: sibuk.size > 0,
          onClick: () => { mulaiEditorKktp(); gambar(); },
        }, dok ? t('atpEditor.mulai') : t('atpEditor.susun')) : null,
        kontrolTinjauan(dok, JENIS.KKTP),
        dok ? h('button', { type: 'button', class: 'tombol tombol-sekunder', onClick: cetak }, 'Unduh PDF') : null,
        dok ? h('span', { class: 'meta' }, t('detail.sumber', { sumber: t(`sumber.${dok.sumber}`) })) : null),
      kurang.length ? peringatan(t('detail.prasyarat', { daftar: kurang.map((k) => t(`dok.${k}`)).join(', ') })) : null,
      statusDok(JENIS.KKTP) === STATUS.USANG && dok ? peringatan(t('detail.usang')) : null,
      dok && dokumen[JENIS.ATP] ? terapkanTinjauan(renderKktp(dok.payload, dokumen[JENIS.ATP].payload, paket), dok, JENIS.KKTP)
        : kurang.length ? null : h('p', { class: 'kosong' }, t('detail.belumAda')));
  }

  function panelModul() {
    const kurang = prasyaratKurang(JENIS.MODUL);
    const unit = unitAtp();
    const sm = statusModul();

    const bilah = h('div', { class: 'bilah-aksi no-print' },
      unit.length ? h('span', { class: 'meta' }, t('modul.ringkas', { siap: sm.siap, total: sm.total })) : null);

    if (kurang.length) {
      return h('div', null,
        !canGenerateDocuments ? h('p', { class: 'kotak kotak-info no-print', role: 'note' }, t('detail.dokumenKhususGuru')) : null,
        h('p', { class: 'kotak kotak-info no-print', role: 'note' }, t(canGenerateAi ? 'detail.aiTinjau' : 'detail.manualGratis')),
        canGenerateDocuments && !canGenerateAi ? h('p', { class: 'kotak kotak-info no-print', role: 'note' }, t('detail.aiDiblokir')) : null,
        bilah,
        peringatan(t('detail.prasyarat', { daftar: kurang.map((k) => t(`dok.${k}`)).join(', ') }))
      );
    }

    const dep = depRev(JENIS.MODUL);
    const daftar = h('ul', { class: 'daftar-unit no-print', role: 'list' }, unit.map((u) => {
      const d = modul[String(u.no)];
      const st = !d ? STATUS.BELUM : Object.entries(dep).every(([k, v]) => d.sumberRev?.[k] === v) ? STATUS.SIAP : STATUS.USANG;
      return h('li', null, h('button', {
        type: 'button', class: `unit-tombol ${u.no === unitModulAktif ? 'aktif' : ''}`, 'aria-current': u.no === unitModulAktif ? 'true' : null,
        disabled: editorJenis === JENIS.MODUL || tinjauKey.startsWith('modul:'),
        onClick: () => {
          unitModulAktif = u.no;
          history.replaceState(null, '', urlPaket(JENIS.MODUL, `unit=${u.no}`));
          gambar();
        }
      }, `${u.no}. ${u.nama}`, ' ', lencana(st)));
    }));

    const u = unit.find((x) => x.no === unitModulAktif) ?? unit[0];
    const d = u ? modul[String(u.no)] : null;
    const editing = editorJenis === JENIS.MODUL;
    const rincian = u ? h('div', { class: 'modul-rincian' },
      editing
        ? h('div', null, kontrolEditorManual(() => simpanModulManual(u)), editor.el)
        : h('div', null,
          h('div', { class: 'bilah-aksi no-print' },
            canGenerateDocuments ? h('button', {
              type: 'button', class: 'tombol', disabled: sibuk.size > 0,
              onClick: () => { mulaiEditorModul(u); gambar(); },
            }, d ? t('atpEditor.mulai') : t('atpEditor.susun')) : null,
            canGenerateDocuments && canGenerateAi ? tombolAi(JENIS.MODUL, u) : null,
            kontrolTinjauan(d, JENIS.MODUL, u.no),
            d ? h('button', { type: 'button', class: 'tombol tombol-sekunder', onClick: cetak }, 'Unduh PDF') : null),
          d ? terapkanTinjauan(renderModul(
            d.payload,
            u,
            paket,
            dokumen[JENIS.ATP]?.payload,
            dokumen[JENIS.PROTA]?.payload,
            dokumen[JENIS.PROSEM]?.payload,
          ), d, `modul:${u.no}`) : h('p', { class: 'kosong' }, t('detail.belumAda')))) : null;

    return h('div', null,
      !canGenerateDocuments ? h('p', { class: 'kotak kotak-info no-print', role: 'note' }, t('detail.dokumenKhususGuru')) : null,
      h('p', { class: 'kotak kotak-info no-print', role: 'note' }, t(canGenerateAi ? 'detail.aiTinjau' : 'detail.manualGratis')),
      canGenerateDocuments && !canGenerateAi ? h('p', { class: 'kotak kotak-info no-print', role: 'note' }, t('detail.aiDiblokir')) : null,
      bilah, h('div', { class: 'modul-tata' }, daftar, rincian));
  }

  function panel() {
    switch (tab) {
      case JENIS.RPE: return panelUmum(tab, dokumen.rpe ? renderRpe(dokumen.rpe.payload, paket) : null);
      case JENIS.CP: return panelCp();
      case JENIS.ATP: return panelAtp();
      case JENIS.PROTA: return panelUmum(tab, dokumen.prota ? renderProta(dokumen.prota.payload, paket) : null);
      case JENIS.PROSEM: return panelUmum(tab, dokumen.prosem ? renderProsem(dokumen.prosem.payload, paket) : null);
      case JENIS.KKTP: return panelKktp();
      default: return panelModul();
    }
  }

  function barisTab() {
    const daftar = h('div', { class: 'tab-daftar no-print', role: 'tablist', 'aria-label': t('detail.tabLabel') },
      URUTAN_DOKUMEN.map((j, i) => {
        const st = statusTab(j);
        const sm = j === JENIS.MODUL ? statusModul() : null;
        return h('button', {
          type: 'button', role: 'tab', id: `tab-${j}`, 'aria-selected': j === tab ? 'true' : 'false', 'aria-controls': 'panel-dok',
          tabindex: j === tab ? '0' : '-1', class: `tab ${j === tab ? 'aktif' : ''}`,
          onClick: () => pindahTab(j)
        }, h('span', { class: 'tab-no' }, String(i + 1)), h('span', null, t(`dok.${j}`)),
        lencana(st, sm && sm.total ? `${sm.siap}/${sm.total}` : ''));
      }));
    daftar.addEventListener('keydown', (e) => {
      const i = URUTAN_DOKUMEN.indexOf(tab);
      const ke = { ArrowRight: i + 1, ArrowLeft: i - 1, Home: 0, End: URUTAN_DOKUMEN.length - 1 }[e.key];
      if (ke === undefined) return;
      e.preventDefault();
      pindahTab(URUTAN_DOKUMEN[(ke + URUTAN_DOKUMEN.length) % URUTAN_DOKUMEN.length], true);
    });
    return daftar;
  }

  async function pindahTab(j, fokus = false) {
    if (j === tab) return;
    if (tinjauKey && !(await konfirmasi('Perubahan tinjauan belum disimpan. Batalkan perubahan?', { bahaya: true }))) return;
    if (editor && editorKotor && !(await konfirmasi(t('atpEditor.buangPerubahan'), { bahaya: true }))) return;
    editor = null; editorJenis = null; editorKotor = false;
    tinjauKey = ''; tinjauDraf = null;
    tab = j;
    const unit = j === JENIS.MODUL ? `?unit=${unitModulAktif}` : '';
    history.replaceState(null, '', urlPaket(j, unit));
    gambar();
    if (fokus) wadah.querySelector(`#tab-${j}`)?.focus();
  }

  function gambar() {
    if (!(dimuat.paket && dimuat.dokumen && dimuat.modul)) {
      kosongkan(akar).append(h('p', { class: 'memuat', role: 'status' }, t('umum.memuat')));
      return;
    }
    if (!paket) {
      kosongkan(akar).append(h('p', { class: 'kotak kotak-galat', role: 'alert' }, t('detail.tidakDitemukan')),
        h('a', { href: urlDaftar, class: 'tombol' }, t('detail.kembali')));
      return;
    }
    const fokusAktif = document.activeElement?.id;
    const konten = h('div', { id: 'panel-dok', role: 'tabpanel', 'aria-labelledby': `tab-${tab}`, tabindex: '-1', class: 'panel-dok' }, panel());
    kosongkan(akar).append(
      h('div', { class: 'detail-kepala no-print' },
        h('a', { href: urlDaftar, class: 'tautan-kembali' }, `← ${t('detail.kembali')}`),
        h('h2', null, paket.mapel),
        h('p', { class: 'meta' }, `${paket.jenjang ? `${paket.jenjang.toUpperCase()} · ` : ''}${t('umum.kelas')} ${paket.kelas} · ${t('umum.fase')} ${paket.fase} · ${paket.tahunAjaran} · ${paket.jpPerPekan} JP/${t('umum.pekan')}`),
        canEditPackage ? h('button', { type: 'button', class: 'tombol tombol-sekunder tombol-kecil', onClick: ubahKonteks }, t('detail.ubahKonteks')) : null),
      panelAkses(), barisTab(), konten);
    if (fokusAktif && fokusAktif.startsWith('tab-')) document.getElementById(fokusAktif)?.focus();
  }

  const galatAksesDokumen = (e) => { toast(t(`galat.${e?.code === 'permission-denied' ? 'AKSES_DITOLAK' : 'UMUM'}`), 'galat'); };

  if (tenantId) {
    void muatKopSekolah(tenantId).then((imageDataUrl) => {
      kopDataUrl = imageDataUrl;
      paket = konteksDenganKop(paket);
      muatUlang();
    }).catch((error) => {
      console.error('[perencanaan] gagal memuat kop sekolah:', error);
      toast('Kop sekolah belum dapat dimuat. Periksa migrasi dan akses sekolah.', 'galat');
    });
  }

  const berhenti = [
    dengarPaket(uid, paketId, (p) => {
      paket = konteksDenganKop(p);
      dimuat.paket = true;
      if (p && pemilikPaket && adminTenant === null) muatAdminTenant();
      muatUlang();
    }, galatAksesDokumen),
    dengarDokumen(uid, tenantId, paketId, (d) => { dokumen = d; dimuat.dokumen = true; muatUlang(); }, galatAksesDokumen),
    dengarModul(uid, tenantId, paketId, (m) => { modul = m; dimuat.modul = true; muatUlang(); }, galatAksesDokumen)
  ];

  /** Jangan menimpa penyunting ATP yang sedang dikerjakan saat data masuk. */
  function muatUlang() {
    if (editor && editorKotor) return;
    if (editor && !editorKotor) {
      editor = null;
      editorJenis = null;
    }
    gambar();
  }

  gambar();

  return () => {
    berhenti.forEach((fn) => fn());
    akar.remove();
  };
}
