// web/src/components/profilAksi.js
// Aksi dari menu profil & menu titik tiga di header: foto profil, notifikasi (FCM), ulasan aplikasi.
// Modul Storage dan Messaging dimuat saat dibutuhkan saja (dynamic import) agar bundel awal tetap ringan.
//
// Peningkatan dibanding versi sebelumnya:
//   - Aksi ganda (klik berulang) dikunci; galat tak tertangani ditangkap di satu pintu masuk.
//   - Foto: orientasi EXIF dihormati, latar putih untuk PNG/WebP transparan, cache-busting URL,
//     input berkas dipasang sementara di DOM (iOS Safari kadang tidak memicu "change" bila tidak).
//   - Notifikasi: izin diminta SEBELUM import dinamis (Safari mewajibkan gestur pengguna segar),
//     pesan saat aplikasi terbuka (foreground) ditampilkan sebagai toast.
//   - Ulasan: isi otomatis ulasan lama tidak menimpa ketikan pengguna dan kebal balapan antar-buka.
import { auth, db, rtdb, ambilStorage } from '../firebase/index.js';
import { updateProfile } from 'firebase/auth';
import { doc, getDoc, setDoc, serverTimestamp } from 'firebase/firestore';
import { ref, set, remove } from 'firebase/database';
import { VAPID_KEY, LINK_PERENCANAAN } from '../config.js';
import { ambilProfil, namaDariUser, perbaruiAvatar, linkLuarAman, ikon } from '../ui.js';
import { toast } from './toast.js';
import { getState, setState } from '../state.js';
import { urlFotoProfil } from '../services/protectedMedia.js';
import { tokenGoogleWorkspaceAktif } from '../auth.js';

// Toast kini satu sumber (toast.js). Re-export agar impor lama dari modul ini tetap jalan.
export { toast };

const UKURAN_MAKS_BERKAS = 5 * 1024 * 1024;   // 5 MB sebelum dikecilkan
const UKURAN_MAKS_FOTO_KOMPRES = 128 * 1024;
const SISI_FOTO = 256;                         // px
const PANJANG_ULASAN = 500;

const galat = (kode, pesan) => Object.assign(new Error(pesan || kode), { code: kode });

function pesanGalat(e) {
  const k = String((e && e.code) || '');
  if (k === 'storage/unauthorized') return 'Foto tidak dapat diunggah karena izin akses. Hubungi admin sekolah.';
  if (k === 'storage/quota-exceeded') return 'Kuota penyimpanan penuh. Hubungi admin sekolah.';
  if (k === 'storage/canceled') return 'Pengunggahan dibatalkan.';
  if (/permission[-_]denied/i.test(k)) return 'Akses ditolak oleh aturan keamanan. Hubungi admin.';
  if (k === 'ale/tanpa-vapid') return 'Notifikasi belum dapat diaktifkan di aplikasi ini. Hubungi admin sekolah.';
  if (k === 'ale/tidak-didukung') return 'Peramban ini tidak mendukung notifikasi push.';
  if (k === 'ale/izin-ditolak' || k === 'messaging/permission-blocked') {
    return 'Izin notifikasi ditolak. Ubah di pengaturan situs peramban, lalu coba lagi.';
  }
  if (k === 'messaging/failed-service-worker-registration') {
    return 'Layanan notifikasi gagal dimuat. Muat ulang halaman lalu coba lagi.';
  }
  if (k === 'ale/gambar') return 'Gambar tidak dapat diproses. Pilih foto lain.';
  if (k === 'auth/requires-recent-login') return 'Sesi perlu diperbarui. Keluar lalu masuk kembali.';
  if (k === 'storage/retry-limit-exceeded' || k === 'auth/network-request-failed') return 'Koneksi bermasalah. Coba lagi.';
  return 'Terjadi kesalahan. Silakan coba lagi.';
}

const namaPengguna = (user) => {
  const p = ambilProfil(user.uid);
  return (p && p.nama) || namaDariUser(user);
};

/** Cegah aksi yang sama berjalan dua kali (klik berulang / dobel-ketuk). */
const sibuk = new Set();
async function sekali(kunci, fn) {
  if (sibuk.has(kunci)) return undefined;
  sibuk.add(kunci);
  try { return await fn(); } finally { sibuk.delete(kunci); }
}

/* ---------- Foto profil ---------- */
function pilihBerkas() {
  return new Promise((selesai) => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = 'image/jpeg,image/png,image/webp';
    input.hidden = true;
    const bersihkan = (nilai) => { input.remove(); selesai(nilai); };
    input.addEventListener('change', () => bersihkan((input.files && input.files[0]) || null), { once: true });
    input.addEventListener('cancel', () => bersihkan(null), { once: true });
    document.body.appendChild(input);   // iOS Safari: input harus ada di DOM agar "change" terpicu
    input.click();
  });
}

async function bukaBitmap(berkas) {
  try {
    return await createImageBitmap(berkas, { imageOrientation: 'from-image' });
  } catch (_) {
    return createImageBitmap(berkas);   // peramban lama tanpa opsi orientasi
  }
}

// Potong persegi dari tengah, kecilkan ke 256 px, simpan JPEG (hemat kuota Storage dan transfer).
async function kecilkan(berkas, sisi = SISI_FOTO) {
  let bmp;
  try {
    bmp = await bukaBitmap(berkas);
  } catch (_) {
    throw galat('ale/gambar', 'Gambar tidak dapat dibaca');
  }
  try {
    const s = Math.min(bmp.width, bmp.height);
    for (const [ukuran, kualitas] of [[sisi, 0.82], [192, 0.72], [128, 0.62]]) {
      const kanvas = document.createElement('canvas');
      kanvas.width = kanvas.height = Math.min(ukuran, sisi);
      const g = kanvas.getContext('2d');
      g.fillStyle = '#fff';
      g.fillRect(0, 0, kanvas.width, kanvas.height);
      g.imageSmoothingQuality = 'high';
      g.drawImage(
        bmp,
        (bmp.width - s) / 2,
        (bmp.height - s) / 2,
        s,
        s,
        0,
        0,
        kanvas.width,
        kanvas.height,
      );
      const blob = await new Promise((ok, gagal) =>
        kanvas.toBlob((hasil) => (hasil ? ok(hasil) : gagal(galat('ale/gambar', 'Gagal memproses gambar'))), 'image/jpeg', kualitas));
      if (blob.size <= UKURAN_MAKS_FOTO_KOMPRES) return blob;
    }
    throw galat('ale/gambar', 'Foto tetap terlalu besar setelah dikompresi. Pilih foto lain.');
  } finally {
    if (bmp.close) bmp.close();
  }
}

function tambahFoto() {
  return sekali('foto', async () => {
    const user = auth.currentUser;
    if (!user) return toast('Sesi berakhir. Silakan masuk kembali.', 'galat');
    const berkas = await pilihBerkas();
    if (!berkas) return undefined;
    if (!/^image\/(jpeg|png|webp)$/.test(berkas.type)) return toast('Format foto harus JPG, PNG, atau WebP.', 'galat');
    if (berkas.size > UKURAN_MAKS_BERKAS) return toast('Ukuran foto maksimal 5 MB.', 'galat');

    toast('Mengunggah foto…');
    try {
      const blob = await kecilkan(berkas);
      const [{ ref: sRef, uploadBytes }, storage] = await Promise.all([
        import('firebase/storage'),
        ambilStorage(),
      ]);
      const berkasRef = sRef(storage, `fotoProfil/${user.uid}.jpg`);
      if (blob.size > UKURAN_MAKS_FOTO_KOMPRES) {
        throw galat('ale/gambar', 'Foto terkompresi melebihi batas 128 KB.');
      }
      await uploadBytes(berkasRef, blob, { contentType: 'image/jpeg', cacheControl: 'private,no-store' });
      const url = urlFotoProfil(user.uid);
      await updateProfile(user, { photoURL: url });
      setState({ user: { ...getState().user, photoURL: url } });
      perbaruiAvatar(url, namaPengguna(user));
      const tokenDrive = tokenGoogleWorkspaceAktif();
      if (!tokenDrive) {
        return toast('Foto profil diperbarui. Hubungkan Google Workspace untuk menyimpan salinannya di Drive.', 'ok');
      }
      try {
        const { simpanFotoProfilDiDrive } = await import('../services/googleWorkspace.js');
        const fileDrive = new File([blob], 'AI_nnoe-profile-photo.jpg', { type: 'image/jpeg' });
        await simpanFotoProfilDiDrive(tokenDrive, user.uid, fileDrive);
        return toast('Foto profil diperbarui dan disalin ke Google Drive Anda.', 'ok');
      } catch (error) {
        console.error('[profil] salinan foto ke Drive gagal:', error);
        return toast('Foto profil diperbarui di aplikasi, tetapi salinannya gagal tersimpan di Drive. Coba hubungkan ulang Google Workspace.', 'galat');
      }
    } catch (e) {
      console.error('[profil] unggah foto gagal:', e);
      return toast(pesanGalat(e), 'galat');
    }
  });
}

function hapusFoto() {
  return sekali('foto', async () => {
    const user = auth.currentUser;
    if (!user) return toast('Sesi berakhir. Silakan masuk kembali.', 'galat');
    if (!user.photoURL) return toast('Anda belum memiliki foto profil.');
    if (!window.confirm('Hapus foto profil Anda?')) return undefined;
    try {
      const [{ ref: sRef, deleteObject }, storage] = await Promise.all([
        import('firebase/storage'),
        ambilStorage(),
      ]);
      try {
        await deleteObject(sRef(storage, `fotoProfil/${user.uid}.jpg`));
      } catch (e) {
        if (!e || e.code !== 'storage/object-not-found') throw e;
      }
      await updateProfile(user, { photoURL: null });
      setState({ user: { ...getState().user, photoURL: '' } });
      perbaruiAvatar('', namaPengguna(user));
      return toast('Foto profil dihapus.', 'ok');
    } catch (e) {
      console.error('[profil] hapus foto gagal:', e);
      return toast(pesanGalat(e), 'galat');
    }
  });
}

/* ---------- Notifikasi (FCM) ---------- */
const kunciToken = (t) => t.replace(/[.#$[\]/]/g, '_'); // karakter terlarang pada jalur Realtime Database

let pesanDepanTerpasang = false;

/** Tampilkan notifikasi yang masuk saat aplikasi sedang terbuka (browser tidak menampilkannya sendiri). */
async function pasangPesanDepan(pesan) {
  if (pesanDepanTerpasang) return;
  pesanDepanTerpasang = true;
  const { onMessage } = await import('firebase/messaging');
  onMessage(pesan, (payload) => {
    const n = (payload && payload.notification) || {};
    const teks = [n.title, n.body].filter(Boolean).join(' — ');
    if (teks) toast(teks);
  });
}

async function daftarkanToken({ ulang = false } = {}) {
  const user = auth.currentUser;
  if (!user) throw galat('ale/sesi', 'Belum masuk');
  if (!('Notification' in window)) throw galat('ale/tidak-didukung');
  if (!VAPID_KEY) throw galat('ale/tanpa-vapid');

  // Minta izin LEBIH DULU, sebelum await apa pun yang lambat: Safari/iOS hanya menampilkan
  // dialog izin bila dipanggil di dalam gestur pengguna yang masih "segar".
  if (Notification.permission === 'default') await Notification.requestPermission();
  if (Notification.permission !== 'granted') throw galat('ale/izin-ditolak');

  const { getMessaging, getToken, deleteToken, isSupported } = await import('firebase/messaging');
  if (!(await isSupported())) throw galat('ale/tidak-didukung');

  const pesan = getMessaging(app);
  if (ulang) {
    try {
      const lama = await getToken(pesan, { vapidKey: VAPID_KEY });
      if (lama) await remove(ref(rtdb, `fcmTokens/${user.uid}/${kunciToken(lama)}`));
      await deleteToken(pesan);
    } catch (e) {
      console.warn('[notifikasi] token lama tidak dapat dihapus, lanjut membuat token baru:', e);
    }
  }
  const token = await getToken(pesan, { vapidKey: VAPID_KEY });
  if (!token) throw galat('ale/izin-ditolak');
  await set(ref(rtdb, `fcmTokens/${user.uid}/${kunciToken(token)}`), token);
  await pasangPesanDepan(pesan);
}

function notifikasi(ulang) {
  return sekali('notif', async () => {
    try {
      toast(ulang ? 'Mendaftarkan ulang perangkat…' : 'Mengaktifkan notifikasi…');
      await daftarkanToken({ ulang });
      return toast(ulang ? 'Perangkat berhasil didaftarkan ulang.' : 'Notifikasi aktif di perangkat ini.', 'ok');
    } catch (e) {
      console.error('[notifikasi] gagal:', e);
      return toast(pesanGalat(e), 'galat');
    }
  });
}

/* ---------- Ulasan aplikasi (Firestore: ulasan/{uid}) ---------- */
function buatDialogUlasan() {
  const dlg = document.createElement('dialog');
  dlg.id = 'aleUlasan';
  dlg.className = 'ale-dialog';
  dlg.setAttribute('aria-labelledby', 'aleUlasanJudul');
  dlg.innerHTML = `
    <form class="ale-form-ulasan" novalidate>
      <h2 id="aleUlasanJudul">Ulasan aplikasi</h2>
      <p class="ale-dialog-ket">Ulasan Anda membantu kami menyempurnakan AI_nnoe. Mengirim lagi akan menggantikan ulasan sebelumnya.</p>
      <fieldset class="ale-bintang">
        <legend>Penilaian Anda</legend>
        ${[1, 2, 3, 4, 5].map((n) => `
          <label class="ale-bintang-item">
            <input type="radio" name="rating" value="${n}">
            <span class="ale-bintang-ikon">${ikon('bintang')}</span>
            <span class="sr-only">${n} dari 5</span>
          </label>`).join('')}
      </fieldset>
      <div class="field">
        <label for="aleUlasanTeks">Komentar <span class="text-opsional">(opsional)</span></label>
        <textarea class="input" id="aleUlasanTeks" name="teks" rows="4" maxlength="${PANJANG_ULASAN}"></textarea>
      </div>
      <p class="alert" id="aleUlasanGalat" role="alert" hidden></p>
      <div class="ale-dialog-aksi">
        <button type="button" class="btn btn-outline" data-batal>Batal</button>
        <button type="submit" class="btn btn-primary" id="aleUlasanKirim">Kirim ulasan</button>
      </div>
    </form>`;
  document.body.appendChild(dlg);

  const form = dlg.querySelector('form');
  const radios = [...dlg.querySelectorAll('input[name="rating"]')];
  const err = dlg.querySelector('#aleUlasanGalat');
  const tombol = dlg.querySelector('#aleUlasanKirim');
  const nilaiRating = () => Number((radios.find((r) => r.checked) || {}).value || 0);

  const tandai = () => {
    const nilai = nilaiRating();
    dlg.querySelectorAll('.ale-bintang-item').forEach((el, i) => el.classList.toggle('on', i < nilai));
  };
  const tampilGalat = (teks) => { err.textContent = teks; err.hidden = false; };

  radios.forEach((r) => r.addEventListener('change', tandai));
  // Tanda "disentuh": isi otomatis dari ulasan lama tidak boleh menimpa ketikan pengguna.
  dlg.addEventListener('input', () => { dlg._disentuh = true; });
  dlg.querySelector('[data-batal]').addEventListener('click', () => dlg.close());
  // Klik di area gelap (di luar kotak) menutup dialog
  dlg.addEventListener('click', (e) => { if (e.target === dlg) dlg.close(); });
  dlg._tandai = tandai;
  dlg._sesi = 0;
  dlg._disentuh = false;

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    if (tombol.disabled) return;
    const user = auth.currentUser;
    const rating = nilaiRating();
    if (!user) return tampilGalat('Sesi berakhir. Silakan masuk kembali.');
    if (!rating) return tampilGalat('Pilih jumlah bintang terlebih dahulu.');
    err.hidden = true;
    tombol.disabled = true;
    tombol.textContent = 'Menyimpan…';
    try {
      const profil = ambilProfil(user.uid) || {};
      await setDoc(doc(db, 'ulasan', user.uid), {
        nama: namaPengguna(user),
        sekolah: profil.sekolah || '',
        rating,
        teks: dlg.querySelector('#aleUlasanTeks').value.trim().slice(0, PANJANG_ULASAN),
        diperbarui: serverTimestamp(),
      });
      dlg.close();
      toast('Terima kasih, ulasan Anda tersimpan.', 'ok');
    } catch (ex) {
      console.error('[ulasan] gagal menyimpan:', ex);
      tampilGalat(/permission[-_]denied/i.test(String(ex && ex.code))
        ? 'Ulasan tidak dapat disimpan karena izin akses. Hubungi admin sekolah.'
        : 'Ulasan belum tersimpan. Periksa koneksi lalu coba lagi.');
    } finally {
      tombol.disabled = false;
      tombol.textContent = 'Kirim ulasan';
    }
  });
  return dlg;
}

function bukaUlasan() {
  return sekali('ulasan', async () => {
    const user = auth.currentUser;
    if (!user) return toast('Sesi berakhir. Silakan masuk kembali.', 'galat');
    const dlg = document.getElementById('aleUlasan') || buatDialogUlasan();
    const sesi = (dlg._sesi = (dlg._sesi || 0) + 1);
    dlg._disentuh = false;
    dlg.querySelectorAll('input[name="rating"]').forEach((r) => { r.checked = false; });
    dlg.querySelector('#aleUlasanTeks').value = '';
    dlg.querySelector('#aleUlasanGalat').hidden = true;
    dlg._tandai();
    if (!dlg.open) dlg.showModal();
    try { // isi otomatis dengan ulasan sebelumnya bila ada
      const snap = await getDoc(doc(db, 'ulasan', user.uid));
      // Lewati bila dialog ditutup/dibuka ulang, atau pengguna sudah mulai mengisi.
      if (!snap.exists() || !dlg.open || dlg._sesi !== sesi || dlg._disentuh) return undefined;
      const d = snap.data();
      const nilai = Number(d.rating) || 0;
      const r = nilai >= 1 && nilai <= 5 ? dlg.querySelector(`input[name="rating"][value="${nilai}"]`) : null;
      if (r) r.checked = true;
      dlg.querySelector('#aleUlasanTeks').value = typeof d.teks === 'string' ? d.teks.slice(0, PANJANG_ULASAN) : '';
      dlg._tandai();
    } catch (e) {
      console.warn('[ulasan] ulasan lama tidak terbaca:', e);
    }
    return undefined;
  });
}

/* ---------- Pintu masuk ---------- */
function arahkan(nama) {
  switch (nama) {
    case 'foto-tambah': return tambahFoto();
    case 'foto-hapus': return hapusFoto();
    case 'notif': return notifikasi(false);
    case 'fcm': return notifikasi(true);
    case 'ulasan': return bukaUlasan();
    case 'google':
      window.location.hash = '#/pengaturan/google';
      return undefined;
    case 'api-key':
      window.location.hash = '#/pengaturan/api-ai';
      return undefined;
    case 'kelas-mapel':
      if (linkLuarAman(LINK_PERENCANAAN)) {
        window.open(LINK_PERENCANAAN, '_blank', 'noopener,noreferrer');
        return undefined;
      }
      return toast('Kelas & Mapel Saya akan hadir pada pembaruan berikutnya.');
    default:
      return toast('Fitur ini akan hadir pada pembaruan berikutnya.');
  }
}

/**
 * Jalankan aksi menu profil. Selalu mengembalikan Promise dan tidak pernah melempar:
 * galat tak terduga ditangkap di sini sehingga tidak menjadi "unhandled rejection".
 */
export function jalankanAksi(nama) {
  return Promise.resolve()
    .then(() => arahkan(nama))
    .catch((e) => {
      console.error('[aksi] gagal:', nama, e);
      toast(pesanGalat(e), 'galat');
    });
}
