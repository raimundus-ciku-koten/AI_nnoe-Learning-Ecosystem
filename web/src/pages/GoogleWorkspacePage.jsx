import React, { useEffect, useState } from 'react';
import { useAuth } from '../context/AuthContext.jsx';
import { simpanKunciPublikPengguna } from '../services/encryptionKeyDirectory.js';
import {
  hubungkanGoogleSheetsUntukPengguna,
  hubungkanGoogleMeetUntukPengguna,
  hubungkanGoogleWorkspaceUntukPengguna,
} from '../services/googleWorkspaceAuth.js';
import {
  buatRuangGoogleMeet,
  buatSpreadsheetDenganData,
  buatTautanGoogleCalendar,
  daftarBerkasTerenkripsiDrive,
  daftarCadanganKunciDrive,
  pulihkanCadanganKunciDariDrive,
  simpanCadanganKunciDrive,
  unggahBerkasTerenkripsiDrive,
  unggahKeDrive,
  unduhBerkasTerenkripsiDrive,
} from '../services/googleWorkspace.js';
import {
  buatIdentitasEnkripsiDrive,
  hapusIdentitasEnkripsiDriveDalamSesi,
  identitasEnkripsiDriveDalamSesi,
  pulihkanIdentitasEnkripsiDrive,
  simpanIdentitasEnkripsiDriveDalamSesi,
} from '../services/driveEncryption.js';
import Ikon from '../components/Ikon.jsx';
import '../styles/google-workspace.css';

const jamLokal = (waktu) => {
  const lokal = new Date(waktu.getTime() - waktu.getTimezoneOffset() * 60000);
  return lokal.toISOString().slice(0, 16);
};

function ScopeCard({ ikon, judul, cakupan, children }) {
  return (
    <section className="ale-kartu workspace-card">
      <div className="workspace-card-heading">
        <span><Ikon nama={ikon} /></span>
        <div><h2>{judul}</h2><small>{cakupan}</small></div>
      </div>
      {children}
    </section>
  );
}

export default function GoogleWorkspacePage() {
  const { user } = useAuth();
  const [koneksi, setKoneksi] = useState(null);
  const [busy, setBusy] = useState('');
  const [status, setStatus] = useState('');
  const [error, setError] = useState('');
  const [waktuMulai, setWaktuMulai] = useState(() => jamLokal(new Date(Date.now() + 3600000)));
  const [waktuSelesai, setWaktuSelesai] = useState(() => jamLokal(new Date(Date.now() + 7200000)));
  const [tautanCalendar, setTautanCalendar] = useState('');
  const [tautanMeet, setTautanMeet] = useState('');
  const [fileName, setFileName] = useState('');
  const [identitasVault, setIdentitasVault] = useState(null);
  const [identitasDraft, setIdentitasDraft] = useState(null);
  const [kodePemulihan, setKodePemulihan] = useState('');
  const [kodeKonfirmasi, setKodeKonfirmasi] = useState('');
  const [cadanganDrive, setCadanganDrive] = useState([]);
  const [cadanganTerpilih, setCadanganTerpilih] = useState('');
  const [berkasVault, setBerkasVault] = useState([]);
  const [namaBerkasVault, setNamaBerkasVault] = useState('');
  const [judulSpreadsheet, setJudulSpreadsheet] = useState('');
  const [dataSpreadsheet, setDataSpreadsheet] = useState('');
  const [tautanSpreadsheet, setTautanSpreadsheet] = useState('');
  const [koneksiSheets, setKoneksiSheets] = useState(null);

  const tokenAktif = koneksi && koneksi.expiresAt > Date.now() ? koneksi.accessToken : '';
  const ownerId = user?.id || user?.uid;
  const tokenSheetsAktif = koneksiSheets?.userId === ownerId &&
    koneksiSheets.expiresAt > Date.now() ? koneksiSheets.accessToken : '';

  useEffect(() => {
    setKoneksiSheets(null);
  }, [ownerId]);

  async function muatVault(token) {
    const [cadangan, berkas] = await Promise.all([
      daftarCadanganKunciDrive(token),
      daftarBerkasTerenkripsiDrive(token),
    ]);
    setCadanganDrive(cadangan);
    setBerkasVault(berkas);
    setCadanganTerpilih((current) => current || cadangan[0]?.id || '');
  }

  async function hubungkan() {
    setBusy('connect');
    setError('');
    setStatus('');
    try {
      const sesi = await hubungkanGoogleWorkspaceUntukPengguna(user);
      setKoneksi(sesi);
      setIdentitasVault(identitasEnkripsiDriveDalamSesi(ownerId));
      await muatVault(sesi.accessToken);
      setStatus(`Layanan Google terhubung untuk ${sesi.email}. Izin berlaku sementara di sesi ini.`);
    } catch (err) {
      console.error('[workspace] Gagal menghubungkan akun Google:', err);
      setError(err?.message || 'Akun Google Workspace tidak dapat dihubungkan.');
    } finally {
      setBusy('');
    }
  }

  async function unggah(event) {
    event.preventDefault();
    const formElement = event.currentTarget;
    const berkas = formElement.elements.berkas.files?.[0];
    if (!tokenAktif) {
      setError('Hubungkan kembali Google Workspace untuk melanjutkan.');
      return;
    }

    async function buatKunciVault() {
      setBusy('vault-key');
      setError('');
      setStatus('');
      try {
        const identity = await buatIdentitasEnkripsiDrive();
        setIdentitasDraft(identity);
        setKodePemulihan(identity.recoveryCode);
        setKodeKonfirmasi('');
      } catch (err) {
        console.error('[workspace] Gagal membuat kunci vault:', err);
        setError(err?.message || 'Kunci vault tidak dapat dibuat.');
      } finally {
        setBusy('');
      }
    }

    async function simpanKunciVault() {
      if (!tokenAktif || !identitasDraft || kodeKonfirmasi !== identitasDraft.recoveryCode) {
        setError('Masukkan kembali kode pemulihan dengan tepat sebelum menyimpan kunci.');
        return;
      }
      setBusy('vault-key');
      setError('');
      setStatus('');
      try {
        await simpanCadanganKunciDrive(tokenAktif, identitasDraft.encryptedPrivateKeyBackup);
        await simpanKunciPublikPengguna(ownerId, identitasDraft);
        simpanIdentitasEnkripsiDriveDalamSesi(ownerId, identitasDraft);
        setIdentitasVault(identitasEnkripsiDriveDalamSesi(ownerId));
        setIdentitasDraft(null);
        setKodePemulihan('');
        setKodeKonfirmasi('');
        await muatVault(tokenAktif);
        setStatus('Kunci pemulihan terenkripsi tersimpan di Google Drive. Kode pemulihan hanya tersedia bagi Anda.');
      } catch (err) {
        console.error('[workspace] Gagal menyimpan cadangan kunci vault:', err);
        setError(err?.message || 'Cadangan kunci tidak dapat disimpan ke Drive.');
      } finally {
        setBusy('');
      }
    }

    async function pulihkanKunciVault() {
      if (!tokenAktif || !cadanganTerpilih || !kodePemulihan.trim()) {
        setError('Pilih cadangan kunci Drive dan masukkan kode pemulihan.');
        return;
      }
      setBusy('vault-key');
      setError('');
      setStatus('');
      try {
        const backup = await pulihkanCadanganKunciDariDrive(tokenAktif, cadanganTerpilih);
        const identity = await pulihkanIdentitasEnkripsiDrive(backup, kodePemulihan.trim());
        simpanIdentitasEnkripsiDriveDalamSesi(ownerId, identity);
        await simpanKunciPublikPengguna(ownerId, identity);
        setIdentitasVault(identitasEnkripsiDriveDalamSesi(ownerId));
        setKodePemulihan('');
        setStatus('Kunci pemulihan berhasil dibuka hanya di memori sesi ini.');
      } catch (err) {
        console.error('[workspace] Gagal memulihkan kunci vault:', err);
        setError(err?.message || 'Kunci tidak dapat dipulihkan. Periksa kode dan cadangan.');
      } finally {
        setBusy('');
      }
    }

    async function unggahKeVault(event) {
      event.preventDefault();
      const formElement = event.currentTarget;
      const berkas = formElement.elements.berkasVault.files?.[0];
      if (!tokenAktif || !identitasVault || !ownerId) {
        setError('Hubungkan Drive dan buka kunci vault terlebih dahulu.');
        return;
      }
      setBusy('vault-file');
      setError('');
      setStatus('');
      try {
        await unggahBerkasTerenkripsiDrive(tokenAktif, ownerId, identitasVault, berkas);
        await muatVault(tokenAktif);
        setStatus('Berkas terenkripsi berhasil disimpan ke Drive. Nama dan isi berkas tidak dikirim sebagai metadata terbuka.');
        formElement.reset();
      } catch (err) {
        console.error('[workspace] Gagal menyimpan berkas vault:', err);
        setError(err?.message || 'Berkas terenkripsi tidak dapat disimpan.');
      } finally {
        setBusy('');
      }
    }

    async function unduhDariVault(berkas) {
      if (!tokenAktif || !identitasVault) return;
      setBusy(`vault-download-${berkas.id}`);
      setError('');
      setStatus('');
      try {
        const hasil = await unduhBerkasTerenkripsiDrive(tokenAktif, berkas, identitasVault);
        let url;
        try {
          url = URL.createObjectURL(new Blob([hasil.bytes], { type: hasil.mimeType }));
        } finally {
          hasil.bytes.fill(0);
        }
        const link = document.createElement('a');
        link.href = url;
        link.download = hasil.name;
        link.click();
        setTimeout(() => URL.revokeObjectURL(url), 1000);
        setNamaBerkasVault(hasil.name);
        setStatus(`Berkas ${hasil.name} berhasil didekripsi di perangkat ini.`);
      } catch (err) {
        console.error('[workspace] Gagal membuka berkas vault:', err);
        setError(err?.message || 'Berkas vault tidak dapat dibuka.');
      } finally {
        setBusy('');
      }
    }
    setBusy('drive');
    setError('');
    setStatus('');
    try {
      const hasil = await unggahKeDrive(tokenAktif, berkas);
      setFileName(hasil.name || berkas.name);
      setStatus(`Berkas berhasil dibuat di Google Drive: ${hasil.name || berkas.name}.`);
      formElement.reset();
    } catch (err) {
      console.error('[workspace] Gagal mengunggah ke Drive:', err);
      setError(err?.message || 'Berkas tidak dapat diunggah ke Drive.');
    } finally {
      setBusy('');
    }
  }

  function siapkanAcaraCalendar(event) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    setError('');
    setStatus('');
    try {
      const url = buatTautanGoogleCalendar({
        judul: String(form.get('judul') || ''),
        deskripsi: String(form.get('deskripsi') || ''),
        mulai: waktuMulai,
        selesai: waktuSelesai,
      });
      setTautanCalendar(url);
      setStatus('Rincian acara siap. Buka Google Calendar untuk menyimpannya.');
    } catch (err) {
      setTautanCalendar('');
      setError(err?.message || 'Tautan acara Calendar tidak dapat dibuat.');
    }
  }

  async function buatMeet() {
    setBusy('meet');
    setError('');
    setStatus('');
    setTautanMeet('');
    try {
      const sesiMeet = await hubungkanGoogleMeetUntukPengguna(user);
      const ruang = await buatRuangGoogleMeet(sesiMeet.accessToken);
      setTautanMeet(ruang.meetingUri);
      setStatus('Tautan Google Meet berhasil dibuat. Bagikan hanya kepada peserta yang dituju.');
    } catch (err) {
      console.error('[workspace] Gagal membuat ruang Google Meet:', err);
      setError(err?.message || 'Ruang Google Meet tidak dapat dibuat.');
    } finally {
      setBusy('');
    }
  }

  async function buatSpreadsheet(event) {
    event.preventDefault();
    if (!tokenSheetsAktif) {
      setError('Hubungkan Google Sheets kembali untuk melanjutkan.');
      return;
    }
    const values = dataSpreadsheet
      .replace(/\r/g, '')
      .replace(/\n+$/, '')
      .split('\n')
      .map((row) => row.split('\t'));
    setBusy('sheets');
    setError('');
    setStatus('');
    setTautanSpreadsheet('');
    try {
      const spreadsheet = await buatSpreadsheetDenganData(tokenSheetsAktif, {
        judul: judulSpreadsheet,
        values,
      });
      setTautanSpreadsheet(spreadsheet.spreadsheetUrl);
      setStatus('Spreadsheet berhasil dibuat dan diisi di Google Sheets.');
    } catch (err) {
      console.error('[workspace] Gagal membuat spreadsheet:', err);
      setError(err?.message || 'Spreadsheet tidak dapat dibuat di Google Sheets.');
    } finally {
      setBusy('');
    }
  }

  async function hubungkanSheets() {
    setBusy('sheets-connect');
    setError('');
    setStatus('');
    try {
      const session = await hubungkanGoogleSheetsUntukPengguna(user);
      setKoneksiSheets(session);
      setStatus(`Google Sheets terhubung untuk ${session.email}. Izin hanya berlaku sementara di sesi ini.`);
    } catch (err) {
      console.error('[workspace] Gagal menghubungkan Google Sheets:', err);
      setError(err?.message || 'Google Sheets tidak dapat dihubungkan.');
    } finally {
      setBusy('');
    }
  }

  return (
    <main className="workspace-page">
      <header className="workspace-header">
        <p className="workspace-kicker"><Ikon nama="external" /> Integrasi akun pribadi</p>
        <h1>Google Workspace</h1>
        <p>Hubungkan akun Google milik Anda sendiri untuk Drive. Calendar tidak memerlukan izin tambahan; Meet meminta izin hanya saat Anda membuat ruang.</p>
        <button className="workspace-connect" type="button" onClick={hubungkan} disabled={!!busy}>
          <Ikon nama="external" />
          {busy === 'connect' ? 'Meminta izin Google…' : tokenAktif ? 'Perbarui izin Google' : 'Hubungkan akun Google'}
        </button>
        {koneksi && <p className="workspace-account">Akun terhubung: <strong>{koneksi.email}</strong></p>}
      </header>

      {error && <p className="workspace-message is-error" role="alert">{error}</p>}
      {status && <p className="workspace-message is-success" role="status">{status}</p>}

      <div className="workspace-grid">
        <ScopeCard ikon="shield" judul="Vault privat terenkripsi" cakupan="Enkripsi di perangkat; Google Drive hanya menerima ciphertext">
          <p className="workspace-description">
            Isi dan nama asli berkas dienkripsi sebelum diunggah. Kunci privat hanya berada di memori sesi; cadangan kunci disimpan terenkripsi di Drive.
            Belum ada berbagi dokumen antar pengguna atau kontrol akses sekolah.
          </p>
          {!identitasVault && !identitasDraft && cadanganDrive.length === 0 && berkasVault.length === 0 && (
            <button type="button" onClick={buatKunciVault} disabled={!tokenAktif || !!busy}>
              {busy === 'vault-key' ? 'Membuat kunci…' : 'Buat kunci vault'}
            </button>
          )}
          {identitasDraft && (
            <div className="workspace-vault-recovery">
              <strong>Simpan kode pemulihan di luar Drive sebelum melanjutkan.</strong>
              <code>{kodePemulihan}</code>
              <p className="workspace-description">Kode ini tidak dapat diatur ulang. Jika hilang, berkas terenkripsi tidak dapat dipulihkan.</p>
              <label htmlFor="workspace-recovery-confirm">Ketik atau tempel kembali kode pemulihan</label>
              <input
                id="workspace-recovery-confirm"
                type="password"
                autoComplete="off"
                value={kodeKonfirmasi}
                onChange={(event) => setKodeKonfirmasi(event.target.value)}
                disabled={!!busy}
              />
              <button type="button" onClick={simpanKunciVault} disabled={!tokenAktif || !!busy || kodeKonfirmasi !== kodePemulihan}>
                {busy === 'vault-key' ? 'Menyimpan cadangan…' : 'Konfirmasi dan simpan cadangan'}
              </button>
            </div>
          )}
          {!identitasVault && !identitasDraft && cadanganDrive.length > 0 && (
            <div className="workspace-form">
              <label htmlFor="workspace-key-backup">Cadangan kunci Drive</label>
              <select
                id="workspace-key-backup"
                value={cadanganTerpilih}
                onChange={(event) => setCadanganTerpilih(event.target.value)}
                disabled={!tokenAktif || !!busy}
              >
                {cadanganDrive.map((cadangan) => (
                  <option key={cadangan.id} value={cadangan.id}>
                    Cadangan {new Date(cadangan.createdTime).toLocaleString()}
                  </option>
                ))}
              </select>
              <label htmlFor="workspace-recovery-code">Kode pemulihan</label>
              <input
                id="workspace-recovery-code"
                type="password"
                autoComplete="off"
                value={kodePemulihan}
                onChange={(event) => setKodePemulihan(event.target.value)}
                disabled={!tokenAktif || !!busy}
              />
              <button type="button" onClick={pulihkanKunciVault} disabled={!tokenAktif || !!busy || !kodePemulihan.trim()}>
                {busy === 'vault-key' ? 'Memulihkan…' : 'Pulihkan kunci vault'}
              </button>
            </div>
          )}
          {!identitasVault && !identitasDraft && cadanganDrive.length === 0 && berkasVault.length > 0 && (
            <p className="workspace-message is-error" role="alert">
              Ada berkas vault tetapi cadangan kunci tidak ditemukan. Jangan buat kunci baru; pulihkan cadangan yang benar agar berkas lama tetap dapat dibuka.
            </p>
          )}
          {identitasVault && (
            <>
              <p className="workspace-detail">Kunci aktif: {identitasVault.fingerprint.slice(0, 16)}…</p>
              <button type="button" onClick={() => {
                hapusIdentitasEnkripsiDriveDalamSesi(ownerId);
                setIdentitasVault(null);
              }} disabled={!!busy}>
                Kunci vault pada perangkat ini
              </button>
              <form className="workspace-form" onSubmit={unggahKeVault}>
                <label htmlFor="workspace-vault-file">Berkas baru, maksimal 10 MB</label>
                <input id="workspace-vault-file" name="berkasVault" type="file" required disabled={!tokenAktif || !!busy} />
                <button type="submit" disabled={!tokenAktif || !!busy}>
                  {busy === 'vault-file' ? 'Mengenkripsi dan mengunggah…' : 'Enkripsi dan simpan ke Drive'}
                </button>
              </form>
              <div className="workspace-vault-list" aria-label="Berkas terenkripsi di Drive">
                {berkasVault.length === 0 ? <p className="workspace-description">Belum ada berkas terenkripsi.</p> : berkasVault.map((berkas) => (
                  <div className="workspace-vault-entry" key={berkas.id}>
                    <span>{new Date(berkas.createdTime).toLocaleString()} · {Number(berkas.size || 0).toLocaleString()} byte terenkripsi</span>
                    <button
                      type="button"
                      onClick={() => unduhDariVault(berkas)}
                      disabled={!tokenAktif || !!busy}
                    >
                      {busy === `vault-download-${berkas.id}` ? 'Membuka…' : 'Dekripsi & unduh'}
                    </button>
                  </div>
                ))}
              </div>
            </>
          )}
        </ScopeCard>

        <ScopeCard ikon="file" judul="Unggah Drive biasa" cakupan="Berkas disimpan tanpa enkripsi vault">
          <p className="workspace-description">Gunakan vault terenkripsi untuk dokumen sensitif. Unggahan biasa ini dapat dibaca sebagai berkas normal di Google Drive Anda.</p>
          <form className="workspace-form" onSubmit={unggah}>
            <label htmlFor="workspace-file">Pilih berkas, maksimal 10 MB</label>
            <input id="workspace-file" name="berkas" type="file" required disabled={!tokenAktif || !!busy} />
            <button type="submit" disabled={!tokenAktif || !!busy}>
              {busy === 'drive' ? 'Mengunggah…' : 'Unggah tanpa enkripsi'}
            </button>
          </form>
          {fileName && <small className="workspace-detail">Terakhir dibuat dari aplikasi: {fileName}</small>}
        </ScopeCard>

        <ScopeCard ikon="calendar" judul="Google Calendar" cakupan="Menyiapkan acara melalui tautan resmi; tanpa akses kalender">
          <form className="workspace-form" onSubmit={siapkanAcaraCalendar} onChange={() => setTautanCalendar('')}>
            <label htmlFor="workspace-event-title">Judul acara</label>
            <input id="workspace-event-title" name="judul" type="text" maxLength="120" required disabled={!!busy} />
            <label htmlFor="workspace-event-start">Mulai</label>
            <input id="workspace-event-start" type="datetime-local" value={waktuMulai} onChange={(event) => setWaktuMulai(event.target.value)} required disabled={!!busy} />
            <label htmlFor="workspace-event-end">Selesai</label>
            <input id="workspace-event-end" type="datetime-local" value={waktuSelesai} onChange={(event) => setWaktuSelesai(event.target.value)} required disabled={!!busy} />
            <label htmlFor="workspace-event-description">Catatan (opsional)</label>
            <textarea id="workspace-event-description" name="deskripsi" maxLength="2000" rows="3" disabled={!!busy} />
            <button type="submit" disabled={!!busy}>
              Siapkan acara
            </button>
          </form>
          {tautanCalendar && (
            <a className="workspace-detail" href={tautanCalendar} target="_blank" rel="noreferrer">
              Tambahkan ke Google Calendar
            </a>
          )}
        </ScopeCard>

        <ScopeCard ikon="play" judul="Google Meet" cakupan="Izin meetings.space.created diminta saat tombol digunakan">
          <p className="workspace-description">Buat tautan rapat atas nama akun Google Anda. Token hanya dipakai saat permintaan ini dan tidak disimpan aplikasi.</p>
          <button type="button" onClick={buatMeet} disabled={!!busy || !user?.email}>
            {busy === 'meet' ? 'Meminta izin dan membuat ruang…' : 'Buat tautan Google Meet'}
          </button>
          {tautanMeet && (
            <p className="workspace-detail">
              <a href={tautanMeet} target="_blank" rel="noreferrer">{tautanMeet}</a>
            </p>
          )}
        </ScopeCard>

        <ScopeCard ikon="file" judul="Google Sheets" cakupan="Membuat spreadsheet baru dan menulis nilai; tidak membaca spreadsheet lain">
          <p className="workspace-description">
            Tempel tabel berformat TSV (kolom dipisahkan tab, baris dipisahkan baris baru). Data ditulis sebagai nilai mentah,
            sehingga isi tidak dieksekusi sebagai formula. Koneksi ini hanya meminta identitas dasar dan akses file aplikasi (drive.file);
            token hanya disimpan di memori sesi.
          </p>
          <button type="button" onClick={hubungkanSheets} disabled={!!busy}>
            {busy === 'sheets-connect' ? 'Meminta izin Sheets…' : tokenSheetsAktif ? `Sheets terhubung: ${koneksiSheets.email}` : 'Hubungkan Google Sheets'}
          </button>
          <form className="workspace-form" onSubmit={buatSpreadsheet}>
            <label htmlFor="workspace-sheet-title">Judul spreadsheet</label>
            <input
              id="workspace-sheet-title"
              type="text"
              maxLength="120"
              value={judulSpreadsheet}
              onChange={(event) => setJudulSpreadsheet(event.target.value)}
              required
              disabled={!tokenSheetsAktif || !!busy}
            />
            <label htmlFor="workspace-sheet-data">Data TSV (maksimal 500 baris, 20 kolom)</label>
            <textarea
              id="workspace-sheet-data"
              rows="6"
              value={dataSpreadsheet}
              onChange={(event) => setDataSpreadsheet(event.target.value)}
              placeholder={'Nama\tKelas\nAyu\t5A'}
              required
              disabled={!tokenSheetsAktif || !!busy}
            />
            <button type="submit" disabled={!tokenSheetsAktif || !!busy}>
              {busy === 'sheets' ? 'Membuat spreadsheet…' : 'Buat Google Sheet'}
            </button>
          </form>
          {tautanSpreadsheet && (
            <a className="workspace-detail" href={tautanSpreadsheet} target="_blank" rel="noreferrer">
              Buka spreadsheet yang dibuat
            </a>
          )}
        </ScopeCard>
      </div>

      <aside className="workspace-privacy">
        <Ikon nama="badge" />
        <p>
          Aplikasi meminta izin Drive per berkas untuk fitur yang Anda gunakan. Google Meet meminta cakupan non-sensitif
          <code> meetings.space.created </code> hanya saat Anda memilih membuat ruang. Calendar memakai tautan template tanpa membaca atau mengubah kalender lewat API.
          Sheets meminta akses per berkas secara terpisah untuk membuat spreadsheet baru dari data yang Anda tempel.
          Aplikasi tidak membaca spreadsheet Google lain. Salinan lampiran chat bersifat opsional
          dan hanya dibuat saat Anda memilihnya. Vault mengenkripsi berkas di browser, dan akses Google Workspace memakai Google Identity Services langsung
          dengan cakupan OAuth terbatas; token akses disimpan sementara di memori halaman, bukan di Supabase atau penyimpanan browser;
          izin dapat dicabut dari pengaturan Akun Google.
        </p>
      </aside>
    </main>
  );
}
