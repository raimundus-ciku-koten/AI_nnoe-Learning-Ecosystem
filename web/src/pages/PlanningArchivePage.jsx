import React, { useEffect, useState } from 'react';
import { useAuth } from '../context/AuthContext.jsx';
import { daftarArsipPerencanaan } from './perencanaan/services/repository.js';
import './planning-archive.css';

const JENIS_DOKUMEN = {
  rpe: 'RPE',
  atp: 'ATP',
  prota: 'Program Tahunan',
  prosem: 'Program Semester',
  kktp: 'KKTP',
  modul: 'Modul Ajar'
};

const FORMAT_TANGGAL = new Intl.DateTimeFormat('id-ID', {
  day: 'numeric',
  month: 'short',
  year: 'numeric'
});

function tanggalDokumen(nilai) {
  const waktu = nilai?.toMillis?.() ?? (typeof nilai === 'number' ? nilai : null);
  return waktu ? FORMAT_TANGGAL.format(new Date(waktu)) : 'Tanggal tidak tersedia';
}

function tautanDokumen(dokumen) {
  const jenis = dokumen.jenis === 'modul' ? 'modul' : dokumen.jenis;
  const unit = dokumen.jenis === 'modul' && dokumen.noUnit
    ? `?unit=${encodeURIComponent(dokumen.noUnit)}`
    : '';
  return `#/perencanaan/${encodeURIComponent(dokumen.paketId)}/${encodeURIComponent(jenis)}${unit}`;
}

export default function PlanningArchivePage() {
  const { user } = useAuth();
  const [dokumen, setDokumen] = useState([]);
  const [jenisAktif, setJenisAktif] = useState('semua');
  const [kataKunci, setKataKunci] = useState('');
  const [memuat, setMemuat] = useState(true);
  const [galat, setGalat] = useState('');

  useEffect(() => {
    let aktif = true;
    setMemuat(true);
    setGalat('');

    daftarArsipPerencanaan(user.uid)
      .then((hasil) => {
        if (aktif) setDokumen(hasil);
      })
      .catch((error) => {
        console.error('[arsip-perencanaan] Gagal memuat hasil perencanaan:', error);
        if (!aktif) return;
        setGalat(error?.code === 'permission-denied'
          ? 'Anda tidak memiliki akses untuk membaca arsip ini.'
          : 'Arsip gagal dimuat. Periksa koneksi lalu coba muat ulang halaman.');
      })
      .finally(() => {
        if (aktif) setMemuat(false);
      });

    return () => { aktif = false; };
  }, [user.uid]);

  const kata = kataKunci.trim().toLocaleLowerCase('id-ID');
  const terlihat = dokumen.filter((item) => {
    if (jenisAktif !== 'semua' && item.jenis !== jenisAktif) return false;
    if (!kata) return true;
    return [item.mapel, item.kelas, item.tahunAjaran, item.payload?.judul]
      .some((teks) => String(teks ?? '').toLocaleLowerCase('id-ID').includes(kata));
  });

  return (
    <div className="ale-arsip">
      <header className="ale-arsip-hero">
        <div>
          <p className="ale-arsip-kicker">Laporan dan Arsip</p>
          <h2>Hasil Perencanaan</h2>
          <p>Telusuri perangkat ajar yang tersimpan dan buka hasilnya dalam paket perencanaan.</p>
        </div>
        <a className="ale-arsip-buat" href="#/perencanaan">Buat perencanaan</a>
      </header>

      <section className="ale-arsip-panel" aria-label="Arsip hasil perencanaan">
        <div className="ale-arsip-toolbar">
          <label>
            <span>Jenis dokumen</span>
            <select value={jenisAktif} onChange={(event) => setJenisAktif(event.target.value)}>
              <option value="semua">Semua jenis</option>
              {Object.entries(JENIS_DOKUMEN).map(([jenis, label]) => (
                <option key={jenis} value={jenis}>{label}</option>
              ))}
            </select>
          </label>
          <label className="ale-arsip-pencarian">
            <span>Cari mapel, kelas, atau tahun ajaran</span>
            <input
              type="search"
              value={kataKunci}
              onChange={(event) => setKataKunci(event.target.value)}
              placeholder="Contoh: Matematika"
            />
          </label>
          <p className="ale-arsip-jumlah" aria-live="polite">
            {memuat ? 'Memuat arsip…' : `${terlihat.length} hasil`}
          </p>
        </div>

        {galat ? (
          <p className="ale-arsip-pesan ale-arsip-galat" role="alert">{galat}</p>
        ) : memuat ? (
          <p className="ale-arsip-pesan" role="status">Memuat hasil perencanaan…</p>
        ) : terlihat.length === 0 ? (
          <div className="ale-arsip-kosong">
            <h3>{dokumen.length ? 'Tidak ada hasil yang cocok' : 'Belum ada hasil perencanaan'}</h3>
            <p>
              {dokumen.length
                ? 'Ubah kata kunci atau pilih jenis dokumen yang lain.'
                : 'Simpan perangkat ajar pada menu Perencanaan agar hasilnya muncul di sini.'}
            </p>
            {!dokumen.length && <a href="#/perencanaan">Buka Perencanaan</a>}
          </div>
        ) : (
          <div className="ale-arsip-tabel-bungkus">
            <table className="ale-arsip-tabel">
              <caption>Hasil perencanaan yang tersimpan di akun Anda</caption>
              <thead>
                <tr>
                  <th scope="col">Dokumen</th>
                  <th scope="col">Mapel dan kelas</th>
                  <th scope="col">Tahun ajaran</th>
                  <th scope="col">Terakhir diperbarui</th>
                  <th scope="col"><span className="ale-sr-only">Tindakan</span></th>
                </tr>
              </thead>
              <tbody>
                {terlihat.map((item) => {
                  const jenisLabel = JENIS_DOKUMEN[item.jenis] || item.jenis.toUpperCase();
                  const unit = item.jenis === 'modul' && item.noUnit ? ` · Unit ${item.noUnit}` : '';
                  const judul = `${jenisLabel}${unit}`;
                  return (
                    <tr key={`${item.paketId}:${item.jenis}:${item.id}`}>
                      <td data-label="Dokumen">
                        <strong>{judul}</strong>
                        <span className="ale-arsip-status">Tersimpan</span>
                      </td>
                      <td data-label="Mapel dan kelas">
                        <strong>{item.mapel}</strong>
                        <span>Kelas {item.kelas} · Fase {item.fase}</span>
                      </td>
                      <td data-label="Tahun ajaran">{item.tahunAjaran}</td>
                      <td data-label="Terakhir diperbarui">
                        {tanggalDokumen(item.diubahPada ?? item.dibuatPada)}
                      </td>
                      <td data-label="Tindakan">
                        <a className="ale-arsip-buka" href={tautanDokumen(item)}>
                          Buka hasil
                        </a>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}
