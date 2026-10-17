import React, { useEffect, useMemo, useState } from 'react';
import { doc, getDoc } from 'firebase/firestore';
import { useAuth } from '../context/AuthContext.jsx';
import { db } from '../firebase/index.js';
import PRICING from '../../../functions/shared/pricing.json';
import '../styles/purchase.css';

const PPN_RATE = Number(import.meta.env.VITE_BILLING_PPN_RATE ?? '0.11');
if (!Number.isFinite(PPN_RATE) || PPN_RATE < 0 || PPN_RATE > 0.2) {
  throw new Error('VITE_BILLING_PPN_RATE harus berupa angka antara 0 dan 0.2.');
}

const formatRupiah = (value) => new Intl.NumberFormat('id-ID', {
  style: 'currency', currency: 'IDR', maximumFractionDigits: 0,
}).format(value);

const HARGA = (paket, siklus) => siklus === 'tahunan'
  ? paket.annualPrice
  : Math.round(paket.annualPrice / PRICING.monthlyDivisor);

function pilihanPaket(paket, idTerpilih, pilih, siklus) {
  const harga = HARGA(paket, siklus);
  return (
    <label className={`ale-purchase-plan${idTerpilih === paket.id ? ' is-selected' : ''}`} key={paket.id}>
      <input
        type="radio"
        name="purchase-plan"
        value={paket.id}
        checked={idTerpilih === paket.id}
        onChange={() => pilih(paket.id)}
      />
      <span className="ale-purchase-plan-copy">
        <strong>{paket.name}</strong>
        <small>{paket.features || `${paket.students.toLocaleString('id-ID')} siswa, ${paket.teachers == null ? 'guru tanpa batas' : `${paket.teachers} guru`}`}</small>
      </span>
      <span className="ale-purchase-plan-price">
        {formatRupiah(harga)}<small>/{siklus === 'bulanan' ? 'bulan' : 'tahun'}</small>
      </span>
    </label>
  );
}

export default function PurchasePage() {
  const { role, tenantId, user } = useAuth();
  const [siklus, setSiklus] = useState('bulanan');
  const [jenisGuru, setJenisGuru] = useState('teacherSd');
  const [planId, setPlanId] = useState('');
  const [status, setStatus] = useState('');
  const [ringkasanSalinan, setRingkasanSalinan] = useState('');
  const [langganan, setLangganan] = useState(null);
  const [galatLangganan, setGalatLangganan] = useState('');
  const [salinGagal, setSalinGagal] = useState(false);

  useEffect(() => {
    let aktif = true;
    async function muatLangganan() {
      if (!user?.uid || !['admin_sekolah', 'guru', 'siswa'].includes(role)) return;
      setGalatLangganan('');
      try {
        if (role === 'admin_sekolah' && !tenantId) {
          throw new Error('Klaim sekolah pada akun belum tersedia.');
        }
        const ref = role === 'admin_sekolah' && tenantId
          ? doc(db, 'tenants', tenantId)
          : doc(db, 'userSubscriptions', user.uid);
        const hasil = await getDoc(ref);
        const data = hasil.exists() ? hasil.data() : {};
        const rekaman = role === 'admin_sekolah' ? data.langganan : data.subscription;
        if (aktif) {
          setLangganan(rekaman || null);
          if (rekaman?.paketId) {
            setPlanId(rekaman.paketId);
            if (rekaman.paketId.startsWith('guru-mapel-')) setJenisGuru('teacherSubject');
            if (rekaman.paketId.startsWith('guru-sd-')) setJenisGuru('teacherSd');
          }
        }
      } catch (error) {
        console.error('[purchase] Gagal memuat status langganan:', error);
        if (aktif) setGalatLangganan('Status langganan belum dapat dimuat. Coba muat ulang halaman.');
      }
    }
    muatLangganan();
    return () => { aktif = false; };
  }, [role, tenantId, user?.uid]);

  const productType = role === 'admin_sekolah' ? 'school' : 'individual';
  const daftarPaket = useMemo(() => {
    if (role === 'admin_sekolah') return PRICING.school;
    if (role === 'siswa') return PRICING.student;
    if (role === 'guru') return PRICING[jenisGuru];
    return [];
  }, [role, jenisGuru]);
  const paketAktif = daftarPaket.find((paket) => paket.id === planId) || daftarPaket[0] || null;
  const harga = paketAktif ? HARGA(paketAktif, siklus) : 0;
  const ppn = Math.round(harga * PPN_RATE);
  const namaPaketAktif = [
    ...PRICING.school, ...PRICING.student, ...PRICING.teacherSd, ...PRICING.teacherSubject,
  ].find((paket) => paket.id === langganan?.paketId)?.name || langganan?.paketId;
  const sampai = langganan?.sampai?.toDate?.();
  const masihAktif = langganan?.aktif === true && sampai instanceof Date && sampai > new Date();

  function pilihTipeGuru(tipe) {
    setJenisGuru(tipe);
    setPlanId('');
    setStatus('');
    setRingkasanSalinan('');
    setSalinGagal(false);
  }

  async function salinRingkasanPesanan() {
    if (!paketAktif) {
      setStatus('Paket yang sesuai dengan peran akun ini belum tersedia.');
      return;
    }
    if (!user) {
      setStatus('Sesi akun tidak tersedia. Silakan masuk kembali sebelum membuat permintaan.');
      setSalinGagal(true);
      return;
    }
    const ringkasan = [
      'Permintaan pembayaran manual AI_nnoe Learning Ecosystem',
      `Nama: ${user.displayName || 'Tidak dicantumkan'}`,
      `Email akun: ${user.email || 'Tidak dicantumkan'}`,
      `Paket: ${paketAktif.name}`,
      `ID paket: ${paketAktif.id}`,
      `Siklus: ${siklus}`,
      `Harga: ${formatRupiah(harga)}`,
      `PPN estimasi (${Math.round(PPN_RATE * 100)}%): ${formatRupiah(ppn)}`,
      `Total: ${formatRupiah(harga + ppn)}`,
    ].join('\n');

    setRingkasanSalinan(ringkasan);
    setStatus('');
    setSalinGagal(false);
    try {
      if (!navigator.clipboard?.writeText) {
        throw new Error('Fitur salin tidak tersedia. Pilih dan salin ringkasan secara manual.');
      }
      await navigator.clipboard.writeText(ringkasan);
      setStatus('Ringkasan pesanan disalin. Kirimkan kepada administrator melalui kanal resmi untuk menerima instruksi pembayaran. Jangan transfer sebelum instruksi pembayaran dikonfirmasi.');
    } catch (error) {
      console.error('[purchase] Gagal menyalin ringkasan pesanan:', error);
      setSalinGagal(true);
      setStatus('Ringkasan tidak dapat disalin otomatis. Salin teks pada kotak di bawah secara manual.');
    }
  }

  function pilihSiklus(value) {
    setSiklus(value);
    setStatus('');
    setRingkasanSalinan('');
    setSalinGagal(false);
  }

  function pilihPaket(id) {
    setPlanId(id);
    setStatus('');
    setRingkasanSalinan('');
  }

  function ajukanPembayaran(event) {
    event.preventDefault();
    if (!paketAktif) {
      setStatus('Paket yang sesuai dengan peran akun ini belum tersedia.');
      return;
    }
    void salinRingkasanPesanan();
  }

  if (!['admin_sekolah', 'guru', 'siswa'].includes(role)) {
    return (
      <main className="ale-purchase">
        <section className="ale-purchase-card" role="status">
          <h2>Paket Purchase</h2>
          <p>Paket berbayar tersedia untuk admin sekolah, guru, dan siswa. Akses orang tua mengikuti paket sekolah/anak.</p>
        </section>
      </main>
    );
  }

  return (
    <main className="ale-purchase">
      <header className="ale-purchase-header">
        <p className="ale-purchase-kicker">Lisensi AI_nnoe</p>
        <h2>{productType === 'school' ? 'Pilih paket sekolah' : 'Pilih paket akun Anda'}</h2>
        <p>
          Harga mengikuti tabel paket pada panduan. Siklus bulanan dihitung sebesar sepersepuluh harga tahunan;
          estimasi PPN ditampilkan terpisah.
        </p>
      </header>
      {galatLangganan && <p className="ale-purchase-message" role="alert">{galatLangganan}</p>}
      {langganan && (
        <section className="ale-purchase-current" aria-live="polite">
          <strong>{masihAktif ? 'Paket aktif' : 'Langganan sebelumnya'}</strong>
          <span>{namaPaketAktif || 'Paket tercatat'}</span>
          <small>{sampai
            ? `${masihAktif ? 'Berlaku hingga' : 'Berakhir pada'} ${new Intl.DateTimeFormat('id-ID', { dateStyle: 'long' }).format(sampai)}`
            : 'Tanggal akhir tidak tersedia.'}</small>
        </section>
      )}
      <form className="ale-purchase-card" onSubmit={ajukanPembayaran}>
        {role === 'guru' && (
          <label className="ale-purchase-field">
            Jenis paket guru
            <select value={jenisGuru} onChange={(event) => pilihTipeGuru(event.target.value)}>
              <option value="teacherSd">Guru Kelas SD</option>
              <option value="teacherSubject">Guru Mapel</option>
            </select>
          </label>
        )}
        <label className="ale-purchase-field">
          Siklus pembayaran
          <select value={siklus} onChange={(event) => pilihSiklus(event.target.value)}>
            <option value="bulanan">Bulanan</option>
            <option value="tahunan">Tahunan (hemat dua bulan)</option>
          </select>
        </label>

        <fieldset className="ale-purchase-seats">
          <legend>{productType === 'school' ? 'Paket dan kapasitas sekolah' : 'Paket pengguna'}</legend>
          <div className="ale-purchase-plans">
            {daftarPaket.map((paket) => pilihanPaket(paket, paketAktif?.id, pilihPaket, siklus))}
          </div>
        </fieldset>

        {paketAktif && (
          <dl className="ale-purchase-total">
            <div><dt>{paketAktif.name} ({siklus})</dt><dd>{formatRupiah(harga)}</dd></div>
            <div><dt>PPN estimasi ({Math.round(PPN_RATE * 100)}%)</dt><dd>{formatRupiah(ppn)}</dd></div>
            <div className="ale-purchase-grand-total"><dt>Total pembayaran</dt><dd>{formatRupiah(harga + ppn)}</dd></div>
          </dl>
        )}
        <p className="ale-purchase-footnote">
          {productType === 'school'
            ? 'Paket sekolah diajukan oleh admin sekolah. Enterprise mencakup guru tanpa batas.'
            : 'Permintaan ini terkait dengan akun yang sedang login.'} Salin ringkasan pesanan, lalu hubungi administrator melalui kanal resmi untuk memperoleh metode dan instruksi pembayaran. Pembayaran serta aktivasi paket diperiksa manual oleh admin. Jangan mengirim uang sebelum detail pembayaran dikonfirmasi.
        </p>
        {status && (
          <p
            className={`ale-purchase-message${salinGagal ? '' : ' ale-purchase-message-info'}`}
            role={salinGagal ? 'alert' : 'status'}
          >
            {status}
          </p>
        )}
        {salinGagal && ringkasanSalinan && (
          <label className="ale-purchase-field">
            Ringkasan pesanan untuk disalin
            <textarea
              className="ale-purchase-summary"
              readOnly
              rows={9}
              value={ringkasanSalinan}
              onFocus={(event) => event.target.select()}
            />
          </label>
        )}
        <button className="ale-purchase-submit" type="submit" disabled={!paketAktif}>
          Salin ringkasan pesanan manual
        </button>
      </form>
      <section className="ale-purchase-demo">
        <h3>Masa demo 48 jam</h3>
        <p>Kuota demo sekolah: 1 admin, 3 guru, dan 30 siswa. Data demo dijadwalkan untuk dihapus setelah 30 hari.</p>
      </section>
    </main>
  );
}
