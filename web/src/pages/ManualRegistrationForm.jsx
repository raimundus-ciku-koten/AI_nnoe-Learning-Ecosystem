import React, { useMemo, useState } from 'react';
import { useAuth } from '../context/AuthContext.jsx';
import PRICING from '../../../functions/shared/pricing.json';
import { buatTautanWhatsAppPemilik } from '../services/manualRegistration.js';

const NOMOR_WHATSAPP_PEMILIK = import.meta.env.VITE_OWNER_WHATSAPP || '';
const formatTanggal = (value) => new Intl.DateTimeFormat('id-ID', {
  dateStyle: 'long',
  timeStyle: 'short',
}).format(new Date(value));

const DAFTAR_PAKET = [
  ...PRICING.school.map((paket) => ({ ...paket, kelompok: 'Sekolah' })),
  ...PRICING.teacherSd.map((paket) => ({ ...paket, kelompok: 'Guru kelas SD' })),
  ...PRICING.teacherSubject.map((paket) => ({ ...paket, kelompok: 'Guru mata pelajaran' })),
  ...PRICING.student.map((paket) => ({ ...paket, kelompok: 'Pengguna perorangan' })),
];

const NILAI_AWAL = {
  kategori: 'perorangan',
  jenisPengguna: 'guru',
  nama: '',
  email: '',
  telepon: '',
  paket: '',
  namaSekolah: '',
  npsn: '',
  jenjang: '',
  provinsi: '',
  kota: '',
  alamat: '',
};

function nilaiPaket(id) {
  return DAFTAR_PAKET.find((item) => item.id === id);
}

function barisRingkasan(label, value) {
  return value ? (
    <div className="ale-registration-print-row" key={label}>
      <dt>{label}</dt>
      <dd>{value}</dd>
    </div>
  ) : null;
}

export default function ManualRegistrationForm() {
  const { user, role } = useAuth();
  const [form, setForm] = useState(() => ({
    ...NILAI_AWAL,
    nama: user?.displayName || '',
    email: user?.email || '',
    kategori: role === 'admin_sekolah' ? 'sekolah' : 'perorangan',
    jenisPengguna: role === 'siswa' || ['ortu', 'orang_tua'].includes(role) ? 'orang_tua' : 'guru',
  }));
  const [permohonan, setPermohonan] = useState(null);
  const [sudahMenyimpan, setSudahMenyimpan] = useState(false);
  const [error, setError] = useState('');

  const pilihanPaket = useMemo(() => {
    if (form.kategori === 'sekolah') return DAFTAR_PAKET.filter((item) => item.kelompok === 'Sekolah');
    if (form.jenisPengguna === 'guru') {
      return DAFTAR_PAKET.filter((item) => item.kelompok.startsWith('Guru'));
    }
    return DAFTAR_PAKET.filter((item) => item.kelompok === 'Pengguna perorangan');
  }, [form.kategori, form.jenisPengguna]);

  const paketTerpilih = nilaiPaket(permohonan?.paket);
  const tautanWhatsApp = buatTautanWhatsAppPemilik(NOMOR_WHATSAPP_PEMILIK);
  const siswakah = role === 'siswa';

  function ubah(kunci, nilai) {
    setForm((current) => ({ ...current, [kunci]: nilai }));
    setPermohonan(null);
    setSudahMenyimpan(false);
  }

  function ajukan(event) {
    event.preventDefault();
    setError('');
    const formElement = event.currentTarget;
    if (!formElement.reportValidity()) return;
    if (form.kategori === 'sekolah' && !/^\d{8}$/.test(form.npsn)) {
      setError('NPSN harus terdiri dari tepat 8 digit.');
      return;
    }
    const createdAt = new Date().toISOString();
    setPermohonan({
      ...form,
      nomor: `ALE-${createdAt.replace(/\D/g, '').slice(0, 14)}`,
      createdAt,
    });
    setSudahMenyimpan(false);
  }

  if (siswakah) {
    return (
      <section className="ale-purchase-card ale-registration" aria-labelledby="manual-registration-title">
        <h2 id="manual-registration-title">Permintaan pendaftaran manual</h2>
        <p role="note">Untuk melindungi data anak, permintaan pembelian atau pendaftaran harus diisi oleh orang tua/wali. Silakan minta orang tua/wali menggunakan akunnya sendiri.</p>
      </section>
    );
  }

  return (
    <section className="ale-purchase-card ale-registration" aria-labelledby="manual-registration-title">
      <div className="ale-registration-screen">
        <h2 id="manual-registration-title">Ajukan pendaftaran atau permintaan penawaran</h2>
        <p>
          Pembayaran Midtrans dan checkout online belum tersedia. Formulir ini hanya menjadi permintaan
          tindak lanjut manual; tidak membuat pesanan, tagihan, pembayaran, atau aktivasi layanan.
        </p>
        <p className="ale-registration-warning" role="note">
          Isian tidak dikirim atau disimpan oleh aplikasi. PDF dibuat melalui dialog cetak browser.
          Setelah mengunduhnya, Anda sendiri yang melampirkan berkas di WhatsApp. Jangan mencantumkan
          kata sandi, NIK/KK anak, nomor kartu pembayaran, atau mengirim salinan identitas.
        </p>

        <form className="ale-registration-form" onSubmit={ajukan}>
          <label className="ale-purchase-field">
            Jenis permintaan
            <select value={form.kategori} onChange={(event) => {
              const kategori = event.target.value;
              ubah('kategori', kategori);
              ubah('paket', '');
            }}>
              <option value="perorangan">Perorangan (guru atau orang tua/wali)</option>
              <option value="sekolah">Sekolah/lembaga</option>
            </select>
          </label>

          {form.kategori === 'perorangan' && (
            <label className="ale-purchase-field">
              Peran pemohon
              <select value={form.jenisPengguna} onChange={(event) => {
                ubah('jenisPengguna', event.target.value);
                ubah('paket', '');
              }}>
                <option value="guru">Guru/pendidik</option>
                <option value="orang_tua">Orang tua/wali</option>
              </select>
            </label>
          )}

          <div className="ale-registration-grid">
            <label className="ale-purchase-field">
              Nama lengkap pemohon
              <input autoComplete="name" maxLength={120} required value={form.nama} onChange={(event) => ubah('nama', event.target.value)} />
            </label>
            <label className="ale-purchase-field">
              Email
              <input autoComplete="email" maxLength={254} required type="email" value={form.email} onChange={(event) => ubah('email', event.target.value)} />
            </label>
            <label className="ale-purchase-field">
              Nomor WhatsApp pemohon
              <input autoComplete="tel" inputMode="tel" maxLength={20} pattern="[+]?[0-9 ()-]{8,20}" required type="tel" value={form.telepon} onChange={(event) => ubah('telepon', event.target.value)} />
            </label>
            <label className="ale-purchase-field">
              Paket yang diminati (belum mengikat)
              <select value={form.paket} onChange={(event) => ubah('paket', event.target.value)}>
                <option value="">Belum ditentukan</option>
                {pilihanPaket.map((paket) => (
                  <option key={paket.id} value={paket.id}>{paket.name}</option>
                ))}
              </select>
            </label>
          </div>

          {form.kategori === 'sekolah' && (
            <>
              <h3>Informasi lembaga minimum</h3>
              <div className="ale-registration-grid">
                <label className="ale-purchase-field">
                  Nama resmi sekolah/lembaga
                  <input autoComplete="organization" maxLength={160} required value={form.namaSekolah} onChange={(event) => ubah('namaSekolah', event.target.value)} />
                </label>
                <label className="ale-purchase-field">
                  NPSN (8 digit)
                  <input inputMode="numeric" maxLength={8} pattern="[0-9]{8}" required value={form.npsn} onChange={(event) => ubah('npsn', event.target.value.replace(/\D/g, '').slice(0, 8))} />
                </label>
                <label className="ale-purchase-field">
                  Jenjang/lembaga
                  <input maxLength={80} required value={form.jenjang} onChange={(event) => ubah('jenjang', event.target.value)} />
                </label>
                <label className="ale-purchase-field">
                  Provinsi
                  <input autoComplete="address-level1" maxLength={80} required value={form.provinsi} onChange={(event) => ubah('provinsi', event.target.value)} />
                </label>
                <label className="ale-purchase-field">
                  Kabupaten/kota
                  <input autoComplete="address-level2" maxLength={100} required value={form.kota} onChange={(event) => ubah('kota', event.target.value)} />
                </label>
                <label className="ale-purchase-field">
                  Alamat lembaga
                  <input autoComplete="street-address" maxLength={240} required value={form.alamat} onChange={(event) => ubah('alamat', event.target.value)} />
                </label>
              </div>
            </>
          )}

          <fieldset className="ale-registration-consent">
            <legend>Konfirmasi sebelum membuat PDF</legend>
            <label><input required type="checkbox" /> Saya menyatakan informasi yang diisi benar dan telah membaca <a href="#/privacy" target="_blank" rel="noreferrer">Informasi Privasi</a>.</label>
            <label><input required type="checkbox" /> Saya memahami PDF memuat nama dan kontak saya, serta data lembaga bila diisi. Saya setuju mengirimkannya sendiri kepada pemilik layanan melalui WhatsApp untuk ditindaklanjuti.</label>
          </fieldset>

          {error && <p className="ale-registration-warning" role="alert">{error}</p>}
          <button className="ale-purchase-submit" type="submit">Siapkan ringkasan pendaftaran</button>
        </form>

        {permohonan && (
          <div className="ale-registration-actions" role="status">
            <p>Permintaan <strong>{permohonan.nomor}</strong> siap dicetak. Pilih “Simpan sebagai PDF” pada dialog cetak browser.</p>
            <button className="ale-purchase-submit" type="button" onClick={() => window.print()}>Cetak / simpan sebagai PDF</button>
            <label className="ale-registration-save-check">
              <input type="checkbox" checked={sudahMenyimpan} onChange={(event) => setSudahMenyimpan(event.target.checked)} />
              Saya sudah menyimpan PDF di perangkat dan akan melampirkannya sendiri di WhatsApp.
            </label>
            {tautanWhatsApp
              ? (
                <a
                  className={`ale-purchase-submit ale-registration-whatsapp${sudahMenyimpan ? '' : ' is-disabled'}`}
                  href={sudahMenyimpan ? tautanWhatsApp : undefined}
                  target="_blank"
                  rel="noopener noreferrer"
                  aria-disabled={!sudahMenyimpan}
                  onClick={(event) => { if (!sudahMenyimpan) event.preventDefault(); }}
                >
                  Buka WhatsApp pemilik dan lampirkan PDF
                </a>
              )
              : <p className="ale-registration-warning" role="status">Kontak WhatsApp pemilik belum dikonfigurasi. Pemilik perlu mengisi `VITE_OWNER_WHATSAPP` di pengaturan environment Vercel sebelum tombol pengiriman tersedia.</p>}
          </div>
        )}
      </div>

      {permohonan && (
        <article className="ale-registration-print" aria-label="Ringkasan permintaan pendaftaran untuk disimpan sebagai PDF">
          <header>
            <p>AI_nnoe Learning Ecosystem</p>
            <h1>Permintaan Pendaftaran / Penawaran Manual</h1>
            <p>Nomor permintaan: {permohonan.nomor}</p>
            <p>Dibuat: {formatTanggal(permohonan.createdAt)}</p>
          </header>
          <dl>
            {barisRingkasan('Jenis permintaan', permohonan.kategori === 'sekolah' ? 'Sekolah/lembaga' : 'Perorangan')}
            {barisRingkasan('Peran pemohon', permohonan.kategori === 'sekolah' ? 'Perwakilan lembaga' : permohonan.jenisPengguna === 'guru' ? 'Guru/pendidik' : 'Orang tua/wali')}
            {barisRingkasan('Nama pemohon', permohonan.nama)}
            {barisRingkasan('Email', permohonan.email)}
            {barisRingkasan('Nomor WhatsApp pemohon', permohonan.telepon)}
            {barisRingkasan('Paket yang diminati', paketTerpilih?.name || 'Belum ditentukan')}
            {permohonan.kategori === 'sekolah' && <>
              {barisRingkasan('Nama resmi lembaga', permohonan.namaSekolah)}
              {barisRingkasan('NPSN', permohonan.npsn)}
              {barisRingkasan('Jenjang/lembaga', permohonan.jenjang)}
              {barisRingkasan('Provinsi', permohonan.provinsi)}
              {barisRingkasan('Kabupaten/kota', permohonan.kota)}
              {barisRingkasan('Alamat lembaga', permohonan.alamat)}
            </>}
          </dl>
          <section>
            <h2>Pernyataan dan batas layanan</h2>
            <p>Pemohon menyatakan informasi di atas benar dan meminta tindak lanjut mengenai pendaftaran/penawaran. Dokumen ini bukan pesanan, invoice, bukti pembayaran, persetujuan aktivasi, atau jaminan ketersediaan layanan.</p>
            <p>Pembayaran online, termasuk Midtrans, belum tersedia. Jangan mengirim kata sandi, NIK/KK anak, nomor kartu pembayaran, atau dokumen identitas melalui WhatsApp.</p>
            <p>PDF dibuat lokal dari informasi yang diisi. Pemohon mengirimkannya secara manual kepada nomor WhatsApp resmi yang ditampilkan di layar pengiriman.</p>
          </section>
          <footer>Dokumen dibuat oleh pemohon · Simpan dan bagikan hanya kepada pihak yang berwenang.</footer>
        </article>
      )}
    </section>
  );
}
