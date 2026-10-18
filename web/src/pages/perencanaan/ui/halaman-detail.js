/**
 * @file Halaman detail satu paket perencanaan: tab RPE → ATP → Prota → Prosem → KKTP → Modul.
 *
 * Prinsip:
 *  - Dokumen mesin dihitung di peramban; dokumen AI memerlukan provider eksternal.
 *    Dokumen turunan otomatis ditandai "usang" bila induknya berubah (rev).
 *  - Tidak ada innerHTML. Semua isi paket dienkripsi sebelum ditulis ke Google Drive.
 *  - Tab mengikuti pola WAI-ARIA (panah kiri/kanan, Home/End).
 */

import { h, kosongkan, toast, konfirmasi } from './dom.js';
import { t } from '../i18n/index.js';
import { JENIS, URUTAN_DOKUMEN, PRASYARAT, STATUS, SUMBER, DOKUMEN_AI } from '../constants.js';
import { hitungRpe } from '../engine/rpe.js';
import { hitungProta, hitungAnggaran, selaraskanJpAtp } from '../engine/prota.js';
import { hitungProsem } from '../engine/prosem.js';
import { validasiAtp } from '../engine/validator.js';
import {
  berikanAksesPaket, cabutAksesPaket, dengarPaket, dengarDokumen, dengarModul,
  simpanDokumen, simpanModul, perbaruiPaket
} from '../services/repository.js';
import { daftarAdminKunciTenant } from '../../../services/encryptionKeyDirectory.js';
import { getState } from '../../../state.js';
import { buatDenganAi } from '../services/ai.js';
import { renderRpe } from './render/rpe.js';
import { renderAtp } from './render/atp.js';
import { renderProta, renderProsem } from './render/prota-prosem.js';
import { renderKktp, renderModul } from './render/kktp-modul.js';
import { peringatan } from './render/umum.js';
import { buatAtpEditor } from './atp-editor.js';
import { bukaFormPaket } from './form-paket.js';

/** Orientasi kertas saat cetak per jenis dokumen. */
const ORIENTASI = Object.freeze({
  [JENIS.RPE]: 'portrait', [JENIS.ATP]: 'landscape', [JENIS.PROTA]: 'portrait',
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
  canGenerateDocuments = true, routeBase = '#/perencanaan', guruUid = ''
}) {
  const queryGuru = guruUid ? `guru=${encodeURIComponent(guruUid)}` : '';
  const urlPaket = (jenis, query = '') => {
    const params = [queryGuru, query.replace(/^\?/, '')].filter(Boolean).join('&');
    return `${routeBase}/${paketId}${jenis ? `/${jenis}` : ''}${params ? `?${params}` : ''}`;
  };
  const urlDaftar = `${routeBase}${guruUid ? `?guru=${encodeURIComponent(guruUid)}` : ''}`;
  /** @type {any} */ let paket = null;
  let dokumen = {};
  let modul = {};
  let tab = URUTAN_DOKUMEN.includes(tabAwal) ? tabAwal : JENIS.RPE;
  const unitDariUrl = Number(new URLSearchParams(search).get('unit'));
  let unitModulAktif = Number.isInteger(unitDariUrl) && unitDariUrl >= 1 && unitDariUrl <= 30
    ? unitDariUrl
    : 1;
  const sibuk = new Set();
  /** @type {AbortController|null} */ let abort = null;
  let editor = null;       // { el, ambil } saat mode ubah ATP
  let editorKotor = false;
  let dimuat = { paket: false, dokumen: false, modul: false };
  let adminTenant = null;
  const pemilikPaket = getState().user?.uid === uid;

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

    [JENIS.ATP]: () => tandaiSibuk(JENIS.ATP, async () => {
      if (!(await konfirmasiTimpa(JENIS.ATP))) return;
      abort = new AbortController();
      const hasil = await buatDenganAi({ paketId, jenis: JENIS.ATP, sinyal: abort.signal });
      const rpe = dokumen[JENIS.RPE].payload;
      const sel = selaraskanJpAtp(hasil.payload, rpe.totalJP, rpe.jpPerPekan, rpe.hari.length);
      if (!sel.ok) throw Object.assign(new Error(sel.alasan), { kode: sel.alasan });
      await simpan(JENIS.ATP, { ...sel.atp, anggaran: sel.anggaran, totalJP: rpe.totalJP }, SUMBER.AI);
      editor = null; editorKotor = false;
      toast(t('umum.berhasilBuat'), 'sukses');
    }),

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

    [JENIS.KKTP]: () => tandaiSibuk(JENIS.KKTP, async () => {
      if (!(await konfirmasiTimpa(JENIS.KKTP))) return;
      abort = new AbortController();
      const hasil = await buatDenganAi({ paketId, jenis: JENIS.KKTP, sinyal: abort.signal });
      await simpan(JENIS.KKTP, hasil.payload, SUMBER.AI);
      toast(t('umum.berhasilBuat'), 'sukses');
    })
  };

  /** Buat Modul Ajar untuk satu unit. */
  async function buatModulUnit(noUnit, sinyal) {
    const hasil = await buatDenganAi({ paketId, jenis: JENIS.MODUL, noUnit, sinyal });
    await simpanModul({
      uid, tenantId, paketId, noUnit, payload: hasil.payload, sumber: SUMBER.AI,
      sumberRev: depRev(JENIS.MODUL), revDasar: modul[String(noUnit)]?.rev ?? 0
    });
  }

  const aksiModulSatu = (no) => tandaiSibuk(`modul:${no}`, async () => {
    abort = new AbortController();
    await buatModulUnit(no, abort.signal);
    toast(t('umum.berhasilBuat'), 'sukses');
  });

  /** Buat semua modul berurutan (menghormati batas laju server; dapat dibatalkan). */
  const aksiModulSemua = () => tandaiSibuk('modul:semua', async () => {
    abort = new AbortController();
    const unit = unitAtp();
    let sukses = 0;
    for (const u of unit) {
      if (abort.signal.aborted) break;
      const d = modul[String(u.no)];
      const dep = depRev(JENIS.MODUL);
      if (d && Object.entries(dep).every(([k, v]) => d.sumberRev?.[k] === v)) { sukses++; continue; }
      unitModulAktif = u.no;
      await buatModulUnit(u.no, abort.signal);
      sukses++;
    }
    toast(t('modul.selesaiSemua', { n: sukses, total: unit.length }), 'sukses');
  });

  async function simpanAtpManual() {
    const draft = editor.ambil();
    const v = validasiAtp(draft);
    if (!v.ok) { toast(`${t('atpEditor.tidakValid')}: ${v.galat.slice(0, 3).join(', ')}`, 'galat'); return; }
    const rpe = dokumen[JENIS.RPE].payload;
    const ang = hitungAnggaran(draft.unit.filter((u) => u.tp.length).length, rpe.totalJP, rpe.jpPerPekan, rpe.hari.length);
    if (!ang.ok) { toast(t(`galat.${ang.alasan}`), 'galat'); return; }
    await tandaiSibuk('atp-simpan', async () => {
      const lama = dokumen[JENIS.ATP];
      await simpanDokumen({
        uid, tenantId, paketId, jenis: JENIS.ATP,
        payload: { ...draft, anggaran: { jpPertemuan: ang.jpPertemuan, uhTotal: ang.uhTotal, sisaTP: ang.sisaTP }, totalJP: rpe.totalJP },
        sumber: SUMBER.MANUAL, sumberRev: lama.sumberRev, revDasar: lama.rev
      });
      editor = null; editorKotor = false;
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
    window.print();
  }

  /* ------------------------------ Tampilan ------------------------------ */

  const lencana = (status, tambahan = '') => h('span', { class: `lencana lencana-${status}` },
    t(`status.${status}`), tambahan ? ` ${tambahan}` : '');

  function tombolAksi(jenis) {
    const kurang = prasyaratKurang(jenis);
    const bekerja = sibuk.has(jenis);
    const status = statusDok(jenis);
    const ai = DOKUMEN_AI.includes(jenis);
    const label = bekerja ? (ai ? t('umum.membuat') : t('umum.menghitung'))
      : status === STATUS.BELUM ? (ai ? t('umum.buatAi') : t('umum.hitung'))
        : (ai ? t('umum.buatUlangAi') : t('umum.hitungUlang'));
    return h('button', {
      type: 'button', class: 'tombol', disabled: kurang.length > 0 || bekerja || (sibuk.size > 0 && !bekerja),
      'aria-busy': bekerja ? 'true' : null, onClick: aksi[jenis]
    }, label);
  }

  function panelUmum(jenis, isiDokumen) {
    const kurang = prasyaratKurang(jenis);
    const status = statusDok(jenis);
    const dok = dokumen[jenis];
    const bekerja = sibuk.has(jenis);

    const bilah = h('div', { class: 'bilah-aksi no-print' },
      canGenerateDocuments ? tombolAksi(jenis) : null,
      canGenerateDocuments && jenis === JENIS.ATP && dok && status !== STATUS.BELUM && !editor
        ? h('button', { type: 'button', class: 'tombol tombol-sekunder', disabled: sibuk.size > 0, onClick: () => { mulaiEditorAtp(); gambar(); } }, t('atpEditor.mulai')) : null,
      dok ? h('button', { type: 'button', class: 'tombol tombol-sekunder', onClick: cetak }, t('umum.cetak')) : null,
      bekerja && abort ? h('button', { type: 'button', class: 'tombol tombol-sekunder', onClick: () => abort.abort() }, t('umum.batalkan')) : null,
      dok ? h('span', { class: 'meta' }, t('detail.sumber', { sumber: t(`sumber.${dok.sumber}`) })) : null);

    return h('div', null,
      !canGenerateDocuments ? h('p', { class: 'kotak kotak-info no-print', role: 'note' }, t('detail.dokumenKhususGuru')) : null,
      bilah,
      kurang.length ? peringatan(t('detail.prasyarat', { daftar: kurang.map((k) => t(`dok.${k}`)).join(', ') })) : null,
      status === STATUS.USANG && dok ? peringatan(t('detail.usang')) : null,
      bekerja ? h('p', { class: 'memuat', role: 'status' }, DOKUMEN_AI.includes(jenis) ? t('umum.menungguAi') : t('umum.menghitung')) : null,
      dok ? isiDokumen : (kurang.length ? null : h('p', { class: 'kosong' }, t('detail.belumAda'))));
  }

  function mulaiEditorAtp() {
    const rpe = dokumen[JENIS.RPE].payload;
    editorKotor = false;
    editor = buatAtpEditor({
      atp: dokumen[JENIS.ATP].payload, totalJP: rpe.totalJP, jpPerPekan: rpe.jpPerPekan, jumlahHari: rpe.hari.length,
      onChange: () => { editorKotor = true; perbaruiTombolSimpan(); }
    });
  }

  let tombolSimpanAtp = null;
  const perbaruiTombolSimpan = () => { if (tombolSimpanAtp) tombolSimpanAtp.disabled = !editorKotor || sibuk.has('atp-simpan'); };

  function panelAtp() {
    const dok = dokumen[JENIS.ATP];
    if (editor) {
      tombolSimpanAtp = h('button', { type: 'button', class: 'tombol', disabled: !editorKotor, onClick: simpanAtpManual }, t('atpEditor.simpanSemua'));
      return h('div', null,
        h('div', { class: 'bilah-aksi no-print' }, tombolSimpanAtp,
          h('button', { type: 'button', class: 'tombol tombol-sekunder', onClick: async () => {
            if (editorKotor && !(await konfirmasi(t('atpEditor.buangPerubahan'), { bahaya: true }))) return;
            editor = null; editorKotor = false; gambar();
          } }, t('atpEditor.selesai'))),
        editor.el);
    }
    return panelUmum(JENIS.ATP, dok ? renderAtp(dok.payload, paket) : null);
  }

  function panelModul() {
    const kurang = prasyaratKurang(JENIS.MODUL);
    const unit = unitAtp();
    const sm = statusModul();
    const bekerjaSemua = sibuk.has('modul:semua');

    const bilah = h('div', { class: 'bilah-aksi no-print' },
      canGenerateDocuments ? h('button', {
        type: 'button', class: 'tombol', disabled: kurang.length > 0 || sibuk.size > 0 || !unit.length, 'aria-busy': bekerjaSemua ? 'true' : null,
        onClick: aksiModulSemua
      }, bekerjaSemua ? t('umum.membuat') : t('modul.buatSemua')) : null,
      canGenerateDocuments && bekerjaSemua && abort ? h('button', { type: 'button', class: 'tombol tombol-sekunder', onClick: () => abort.abort() }, t('umum.batalkan')) : null,
      unit.length ? h('span', { class: 'meta' }, t('modul.ringkas', { siap: sm.siap, total: sm.total })) : null);

    if (kurang.length) {
      return h('div', null,
        !canGenerateDocuments ? h('p', { class: 'kotak kotak-info no-print', role: 'note' }, t('detail.dokumenKhususGuru')) : null,
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
        onClick: () => {
          unitModulAktif = u.no;
          history.replaceState(null, '', urlPaket(JENIS.MODUL, `unit=${u.no}`));
          gambar();
        }
      }, `${u.no}. ${u.nama}`, ' ', lencana(st)));
    }));

    const u = unit.find((x) => x.no === unitModulAktif) ?? unit[0];
    const d = u ? modul[String(u.no)] : null;
    const bekerja = u ? sibuk.has(`modul:${u.no}`) : false;
    const rincian = u ? h('div', { class: 'modul-rincian' },
      h('div', { class: 'bilah-aksi no-print' },
        canGenerateDocuments ? h('button', { type: 'button', class: 'tombol', disabled: sibuk.size > 0, 'aria-busy': bekerja ? 'true' : null, onClick: () => aksiModulSatu(u.no) },
          bekerja ? t('umum.membuat') : d ? t('umum.buatUlangAi') : t('umum.buatAi')) : null,
        d ? h('button', { type: 'button', class: 'tombol tombol-sekunder', onClick: cetak }, t('umum.cetak')) : null),
      bekerja ? h('p', { class: 'memuat', role: 'status' }, t('umum.menungguAi')) : null,
      d ? renderModul(d.payload, u, paket) : h('p', { class: 'kosong' }, t('detail.belumAda'))) : null;

    return h('div', null,
      !canGenerateDocuments ? h('p', { class: 'kotak kotak-info no-print', role: 'note' }, t('detail.dokumenKhususGuru')) : null,
      bilah, h('div', { class: 'modul-tata' }, daftar, rincian));
  }

  function panel() {
    switch (tab) {
      case JENIS.RPE: return panelUmum(tab, dokumen.rpe ? renderRpe(dokumen.rpe.payload, paket) : null);
      case JENIS.ATP: return panelAtp();
      case JENIS.PROTA: return panelUmum(tab, dokumen.prota ? renderProta(dokumen.prota.payload, paket) : null);
      case JENIS.PROSEM: return panelUmum(tab, dokumen.prosem ? renderProsem(dokumen.prosem.payload, paket) : null);
      case JENIS.KKTP: return panelUmum(tab, dokumen.kktp && dokumen.atp ? renderKktp(dokumen.kktp.payload, dokumen.atp.payload, paket) : null);
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
    if (editor && editorKotor && !(await konfirmasi(t('atpEditor.buangPerubahan'), { bahaya: true }))) return;
    editor = null; editorKotor = false;
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
        h('p', { class: 'meta' }, `${t('umum.kelas')} ${paket.kelas} · ${t('umum.fase')} ${paket.fase} · ${paket.tahunAjaran} · ${paket.jpPerPekan} JP/${t('umum.pekan')}`),
        canEditPackage ? h('button', { type: 'button', class: 'tombol tombol-sekunder tombol-kecil', onClick: ubahKonteks }, t('detail.ubahKonteks')) : null),
      panelAkses(), barisTab(), konten);
    if (fokusAktif && fokusAktif.startsWith('tab-')) document.getElementById(fokusAktif)?.focus();
  }

  /* ------------------------------ Langganan ------------------------------ */

  const galatLangganan = (e) => { toast(t(`galat.${e?.code === 'permission-denied' ? 'AKSES_DITOLAK' : 'UMUM'}`), 'galat'); };

  const berhenti = [
    dengarPaket(uid, paketId, (p) => {
      paket = p;
      dimuat.paket = true;
      if (p && pemilikPaket && adminTenant === null) muatAdminTenant();
      muatUlang();
    }, galatLangganan),
    dengarDokumen(uid, tenantId, paketId, (d) => { dokumen = d; dimuat.dokumen = true; muatUlang(); }, galatLangganan),
    dengarModul(uid, tenantId, paketId, (m) => { modul = m; dimuat.modul = true; muatUlang(); }, galatLangganan)
  ];

  /** Jangan menimpa penyunting ATP yang sedang dikerjakan saat data masuk. */
  function muatUlang() {
    if (editor && editorKotor) return;
    if (editor && !editorKotor) editor = null;
    gambar();
  }

  gambar();

  return () => {
    berhenti.forEach((fn) => fn());
    abort?.abort();
    akar.remove();
  };
}
