import React, { useEffect, useMemo, useState } from 'react';
import { useAuth } from '../context/AuthContext.jsx';
import {
  muatLanggananPersonal,
  muatLanggananTenant,
} from '../services/subscriptions.js';
import ManualRegistrationForm from './ManualRegistrationForm.jsx';
import PRICING from '../../../functions/shared/pricing.json';
import '../styles/purchase.css';

const formatRupiah = (value) => new Intl.NumberFormat('id-ID', {
  style: 'currency', currency: 'IDR', maximumFractionDigits: 0,
}).format(value);

const HARGA = (paket, siklus) => siklus === 'tahunan'
  ? paket.annualPrice
  : Math.round(paket.annualPrice / PRICING.monthlyDivisor);
const PERAN_PEMBELI = ['admin_sekolah', 'guru', 'siswa', 'ortu', 'orang_tua'];

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
        <small>Informasi katalog; rincian fitur dan aktivasi paket belum dapat dijamin.</small>
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
  const [langganan, setLangganan] = useState(null);
  const [galatLangganan, setGalatLangganan] = useState('');

  useEffect(() => {
    let aktif = true;
    async function muatLangganan() {
      if (!user?.uid || !PERAN_PEMBELI.includes(role)) return;
      setGalatLangganan('');
      try {
        const rekaman = role === 'admin_sekolah'
          ? await muatLanggananTenant(tenantId)
          : await muatLanggananPersonal(user.uid);
        if (aktif) {
          setLangganan(rekaman || null);
          if (rekaman?.paketId) {
            setPlanId(rekaman.paketId);
            if (rekaman.paketId.startsWith('guru-mapel-')) setJenisGuru('teacherSubject');
            if (rekaman.paketId.startsWith('guru-sd-')) setJenisGuru('teacherSd');
          }
        }
      } catch (error) {
        console.error('[purchase] Gagal memuat status langganan atau pembayaran:', error);
        if (aktif) setGalatLangganan('Status langganan atau pembayaran belum dapat dimuat dari Supabase. Coba muat ulang halaman.');
      }
    }
    muatLangganan();
    return () => { aktif = false; };
  }, [role, tenantId, user?.uid]);

  const productType = role === 'admin_sekolah' ? 'school' : 'individual';
  const daftarPaket = useMemo(() => {
    if (role === 'admin_sekolah') return PRICING.school;
    if (role === 'guru') return PRICING[jenisGuru];
    if (['siswa', 'ortu', 'orang_tua'].includes(role)) return PRICING.student;
    return [];
  }, [role, jenisGuru]);
  const paketAktif = daftarPaket.find((paket) => paket.id === planId) || daftarPaket[0] || null;
  const harga = paketAktif ? HARGA(paketAktif, siklus) : 0;
  const namaPaketAktif = [
    ...PRICING.school, ...PRICING.student, ...PRICING.teacherSd, ...PRICING.teacherSubject,
  ].find((paket) => paket.id === langganan?.paketId)?.name || langganan?.paketId;
  const sampai = langganan?.sampai instanceof Date
    ? langganan.sampai
    : (langganan?.sampai ? new Date(langganan.sampai) : null);
  const masihAktif = langganan?.aktif === true && sampai instanceof Date && sampai > new Date();

  function pilihTipeGuru(tipe) {
    setJenisGuru(tipe);
    setPlanId('');
  }

  if (!PERAN_PEMBELI.includes(role)) {
    return (
      <main className="ale-purchase">
        <section className="ale-purchase-card" role="status">
          <h2>Paket Purchase</h2>
          <p>Informasi paket dapat ditinjau, tetapi checkout dan pembayaran dinonaktifkan.</p>
        </section>
      </main>
    );
  }

  return (
    <main className="ale-purchase">
      <header className="ale-purchase-header">
        <p className="ale-purchase-kicker">Lisensi AI_nnoe</p>
        <h2>{productType === 'school' ? 'Pilih paket sekolah' : 'Pilih paket akun Anda'}</h2>
        <p>Harga indikatif ditampilkan dalam Rupiah sebelum pajak. Pembayaran dan checkout online dinonaktifkan.</p>
      </header>
      {galatLangganan && <p className="ale-purchase-message" role="alert">{galatLangganan}</p>}
      <p className="ale-purchase-message" role="status">
        Harga di bawah hanya informasi, dalam Rupiah, dan belum termasuk pajak. Aplikasi tidak membuat pesanan, membuka halaman pembayaran, atau menagih biaya.
      </p>
      {langganan && (
        <section className="ale-purchase-current" aria-live="polite">
          <strong>{masihAktif ? 'Paket aktif' : 'Langganan sebelumnya'}</strong>
          <span>{namaPaketAktif || 'Paket tercatat'}</span>
          <small>{sampai
            ? `${masihAktif ? 'Berlaku hingga' : 'Berakhir pada'} ${new Intl.DateTimeFormat('id-ID', { dateStyle: 'long' }).format(sampai)}`
            : 'Tanggal akhir tidak tersedia.'}</small>
        </section>
      )}
      <section className="ale-purchase-card">
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
          Siklus harga untuk referensi
          <select value={siklus} onChange={(event) => setSiklus(event.target.value)}>
            <option value="bulanan">Bulanan (informasi)</option>
            <option value="tahunan">Tahunan (informasi)</option>
          </select>
        </label>

        <fieldset className="ale-purchase-seats">
          <legend>{productType === 'school' ? 'Paket dan kapasitas sekolah' : 'Paket pengguna'}</legend>
          <div className="ale-purchase-plans">
            {daftarPaket.map((paket) => pilihanPaket(paket, paketAktif?.id, setPlanId, siklus))}
          </div>
        </fieldset>

        {paketAktif && (
          <dl className="ale-purchase-total">
            <div><dt>{paketAktif.name} ({siklus})</dt><dd>{formatRupiah(harga)}</dd></div>
            <div className="ale-purchase-grand-total"><dt>Harga referensi</dt><dd>{formatRupiah(harga)}</dd></div>
          </dl>
        )}
        <p className="ale-purchase-footnote">
          Tarif ini hanya referensi dalam Rupiah dan belum termasuk pajak. Harga tahunan setara 10 bulan harga bulanan (diskon 2 bulan); pajak dan harga final harus dikonfirmasi sebelum transaksi. Tidak ada checkout atau aktivasi pembelian dari halaman ini.
        </p>
      </section>
      <ManualRegistrationForm />
    </main>
  );
}
