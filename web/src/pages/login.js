import '../styles/login.css';
import { login, resetPassword, masukGoogle } from '../auth.js';
import { toast } from '../components/toast.js';
import { supabase } from '../lib/supabase.ts';
import { pasangTurnstile } from '../services/turnstile.js';
import PRICING from '../../../functions/shared/pricing.json';

const TURNSTILE_SITE_KEY = import.meta.env?.VITE_TURNSTILE_SITE_KEY?.trim() || '';
const PESAN_AUTH = {
  invalid_credentials: 'Email atau kata sandi tidak sesuai.',
  invalid_email: 'Format email tidak valid.',
  invalid_captcha: 'Verifikasi keamanan tidak valid. Selesaikan kembali pemeriksaan Cloudflare.',
  captcha_failed: 'Verifikasi keamanan gagal. Selesaikan kembali pemeriksaan Cloudflare.',
  email_not_confirmed: 'Email belum dikonfirmasi. Periksa kotak masuk Anda.',
  user_banned: 'Akun ini dinonaktifkan. Hubungi admin sekolah.',
  over_request_rate_limit: 'Terlalu banyak percobaan. Tunggu beberapa saat.',
  over_email_send_rate_limit: 'Batas pengiriman email tercapai. Tunggu sebelum mencoba lagi.',
  signup_disabled: 'Pendaftaran akun tidak tersedia. Hubungi admin sekolah.',
  otp_expired: 'Tautan masuk kedaluwarsa. Minta tautan baru.',
  'auth/workspace-account-not-provisioned': 'Akun Google belum terdaftar aktif. Hubungi administrator sekolah.',
  '42501': 'Izin akses profil Supabase ditolak. Periksa status akun dan peran Anda.',
  'PGRST116': 'Profil akun tidak ditemukan. Hubungi administrator sekolah.',
};

function pesanLogin(error, google = false) {
  const code = error?.code;
  const message = PESAN_AUTH[code]
    || (google
      ? 'Login Google gagal. Pastikan provider Google dan URL pengalihan telah dikonfigurasi di Supabase Auth.'
      : 'Tidak dapat masuk saat ini. Silakan coba lagi.');
  const diagnostic = code ? ` (kode: ${code})` : '';
  return `${message}${diagnostic}`;
}

const formatRupiah = (value) => new Intl.NumberFormat('id-ID', {
  style: 'currency', currency: 'IDR', maximumFractionDigits: 0,
}).format(value);
const daftarPaket = [
  ...PRICING.school.map((paket) => ({ ...paket, jenis: 'Paket Sekolah' })),
  ...PRICING.student.map((paket) => ({ ...paket, jenis: 'Paket Siswa' })),
  ...PRICING.teacherSd.map((paket) => ({ ...paket, jenis: 'Paket Guru Kelas SD' })),
  ...PRICING.teacherSubject.map((paket) => ({ ...paket, jenis: 'Paket Guru Mapel' })),
];
const hargaSiklus = (paket, siklus) => siklus === 'tahunan'
  ? paket.annualPrice
  : Math.round(paket.annualPrice / PRICING.monthlyDivisor);

function kartuPaket(paket) {
  const harga = hargaSiklus(paket, 'bulanan');
  return `
    <article class="plan-card">
      <div class="plan-card-copy"><h4>${paket.name}</h4><p>${paket.features}</p></div>
      <strong class="plan-price" data-plan-id="${paket.id}" data-annual-price="${paket.annualPrice}">
        ${formatRupiah(harga)}<small> / bulan</small>
      </strong>
    </article>`;
}

function grupPaket(id, judul, paket) {
  return `
    <section class="plan-group" aria-labelledby="${id}">
      <h3 id="${id}">${judul}</h3>
      <div class="plan-scroller" role="region" tabindex="0" aria-label="Daftar ${judul}. Gunakan tombol panah atau geser untuk melihat semua paket.">
        ${paket.map(kartuPaket).join('')}
      </div>
    </section>`;
}

const IKON_CEK = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><path d="m5 12 4 4L19 6"/></svg>';
const IKON_GOOGLE = '<svg width="18" height="18" viewBox="0 0 18 18" aria-hidden="true"><path fill="#4285F4" d="M17.64 9.2c0-.637-.057-1.251-.164-1.84H9v3.481h4.844a4.14 4.14 0 0 1-1.796 2.716v2.259h2.908c1.702-1.567 2.684-3.875 2.684-6.616z"/><path fill="#34A853" d="M9 18c2.43 0 4.467-.806 5.956-2.18l-2.908-2.259c-.806.54-1.837.86-3.048.86-2.344 0-4.328-1.584-5.036-3.711H.957v2.332A8.997 8.997 0 0 0 9 18z"/><path fill="#FBBC05" d="M3.964 10.71A5.41 5.41 0 0 1 3.682 9c0-.593.102-1.17.282-1.71V4.958H.957A8.996 8.996 0 0 0 0 9c0 1.452.348 2.827.957 4.042l3.007-2.332z"/><path fill="#EA4335" d="M9 3.58c1.321 0 2.508.454 3.44 1.345l2.582-2.58C13.463.891 11.426 0 9 0A8.997 8.997 0 0 0 .957 4.958L3.964 7.29C4.672 5.163 6.656 3.58 9 3.58z"/></svg>';
const IKON_FITUR = {
  perencanaan: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="3.5" y="5" width="17" height="16" rx="2"/><path d="M7.5 3v4M16.5 3v4M3.5 10h17M8 14h3M8 17h6"/></svg>',
  komunikasi: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M20 11.5a7.5 7.5 0 0 1-7.5 7.5H7l-4 2v-6.5A7.5 7.5 0 1 1 20 11.5Z"/><path d="M8 11h8M8 14h5"/></svg>',
  akses: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 3 4.5 6v5.5c0 4.4 3.1 7.6 7.5 9.5 4.4-1.9 7.5-5.1 7.5-9.5V6L12 3Z"/><path d="m9 12 2 2 4-4"/></svg>',
};

function pilihAcak(daftar, jumlah) {
  const hasil = [...daftar];
  for (let i = hasil.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    [hasil[i], hasil[j]] = [hasil[j], hasil[i]];
  }
  return hasil.slice(0, jumlah);
}

async function muatTestimoni(wadah) {
  const target = wadah.querySelector('#testiIsi');
  try {
    const { data, error } = await supabase
      .from('testimonials')
      .select('quote, display_name, role')
      .eq('status', 'published')
      .eq('consent', true)
      .limit(40);
    if (error) throw error;
    const testimoni = pilihAcak(data || [], 3);
    if (!target?.isConnected) return;
    target.replaceChildren();
    if (!testimoni.length) {
      target.innerHTML = '<p class="testi-empty">Belum ada testimoni pengguna yang dipublikasikan.</p>';
      return;
    }
    testimoni.forEach(({ quote, display_name, role }) => {
      const figure = document.createElement('figure');
      figure.className = 'testi';
      const quoteEl = document.createElement('blockquote');
      quoteEl.textContent = `“${quote}”`;
      const caption = document.createElement('figcaption');
      caption.textContent = [display_name, role].filter(Boolean).join(' · ');
      figure.append(quoteEl, caption);
      target.append(figure);
    });
  } catch (error) {
    console.error('[testimoni] Gagal memuat testimoni:', error);
    if (target?.isConnected) {
      target.innerHTML = '<p class="testi-empty">Testimoni tidak dapat dimuat. Silakan coba lagi nanti.</p>';
    }
  }
}

export function halamanLogin(wadah) {
  wadah.classList.add('public-login');
  wadah.innerHTML = `
    <a class="skip-link" href="#/login" data-ke="masuk">Lewati ke formulir masuk</a>
    <header class="site-header">
      <div class="container header-inner">
        <a class="brand" href="#/login" data-ke="top" aria-label="AI_nnoe Learning Ecosystem">
          <img src="/logo-ale-mark.png" alt="" width="52" height="36">
          <span class="brand-text"><strong>AI_nnoe</strong><small>Learning Ecosystem</small></span>
        </a>
        <nav class="nav" aria-label="Navigasi utama">
          <a href="#/login" data-ke="fitur">Fitur</a><a href="#/login" data-ke="harga">Harga</a><a href="#/login" data-ke="testimoni">Testimoni</a>
          <a href="#/privacy">Privasi data</a>
          <a class="btn btn-ghost" href="#/login" data-ke="masuk">Masuk</a>
        </nav>
      </div>
    </header>
    <main id="top">
      <section class="hero" aria-labelledby="judulHero">
        <div class="container hero-grid">
          <section class="card login-card" id="masuk" aria-labelledby="judulMasuk">
            <div class="card-head"><h2 id="judulMasuk">Masuk ke akun Anda</h2><p>Akses dasbor AI_nnoe Learning Ecosystem.</p></div>
            <form id="formLogin" novalidate>
              <div class="field"><label for="lgnEmail">Email</label>
                <input class="input" type="email" id="lgnEmail" name="email" autocomplete="username" inputmode="email" autocapitalize="none" spellcheck="false" placeholder="nama@sekolah.sch.id" required></div>
              <div class="field"><label for="lgnSandi">Kata sandi</label>
                <div class="input-wrap"><input class="input" type="password" id="lgnSandi" name="sandi" autocomplete="current-password" placeholder="Masukkan kata sandi" minlength="6" required>
                  <button type="button" class="toggle-pw" id="btnLihat" aria-controls="lgnSandi" aria-pressed="false">Tampilkan</button></div></div>
              ${TURNSTILE_SITE_KEY ? '<div id="loginCaptcha" class="login-captcha" aria-label="Verifikasi keamanan Cloudflare"></div>' : ''}
              <p id="lgnError" class="alert" role="alert" hidden></p>
              <button id="btnMasuk" class="btn btn-primary btn-block" type="submit"><span class="btn-label">Masuk</span></button>
            </form>
            <div class="divider" role="separator"><span>atau</span></div>
            <button id="btnGoogle" class="btn btn-outline btn-block" type="button">${IKON_GOOGLE} Masuk dengan Google</button>
            <p id="loginStatus" class="login-status" role="status" aria-live="polite" hidden></p>
            <p class="card-note"><a href="#" id="btnLupaSandi">Lupa kata sandi?</a></p>
          </section>
          <div class="hero-copy">
            <span class="eyebrow">Ruang kerja digital untuk warga sekolah</span>
            <h1 id="judulHero">Rencanakan, ajarkan, dan pantau pembelajaran dalam satu ekosistem.</h1>
            <p class="hero-lead">Satukan perangkat ajar, kegiatan belajar, dan komunikasi sekolah dalam ruang kerja yang dirancang untuk guru, siswa, admin, serta orang tua.</p>
            <div class="hero-cta"><a class="btn btn-brand" href="#/login" data-ke="harga">Lihat paket</a><a class="btn btn-outline" href="#/login" data-ke="fitur">Lihat fitur</a></div>
            <ul class="trust-list">
              <li>${IKON_CEK}Tinjau paket dan kapasitas pengguna yang tersedia</li>
              <li>${IKON_CEK}Bandingkan referensi lisensi bulanan dan tahunan</li>
            </ul>
          </div>
        </div>
      </section>
      <section class="section" id="fitur" aria-labelledby="judulFitur" hidden>
        <div class="container"><div class="section-head"><p class="kicker">Ekosistem pembelajaran</p>
          <h2 id="judulFitur">Alat kerja untuk setiap peran di sekolah</h2></div>
          <div class="feature-grid">
            <article class="feature"><span class="feature-icon">${IKON_FITUR.perencanaan}</span><h3>Perencanaan ajar</h3><p>Susun dan arsipkan ATP, RPE, Prota, Prosem, KKTP, dan modul ajar.</p></article>
            <article class="feature"><span class="feature-icon tone-blue">${IKON_FITUR.komunikasi}</span><h3>Komunikasi langsung</h3><p>Guru, siswa, admin, dan orang tua dapat berkoordinasi melalui percakapan.</p></article>
            <article class="feature"><span class="feature-icon tone-amber">${IKON_FITUR.akses}</span><h3>Akses berbasis peran</h3><p>Ruang kerja sekolah terpisah dengan hak akses sesuai peran.</p></article>
          </div>
        </div>
      </section>
      <section class="section section-alt" id="harga" aria-labelledby="judulHarga" hidden>
        <div class="container"><div class="section-head"><p class="kicker">Harga dan lisensi</p>
          <h2 id="judulHarga">Paket sekolah dan paket pengguna</h2>
          <p>Informasi harga paket berikut bukan untuk pembelian. Checkout dan pembayaran dinonaktifkan.</p></div>
          <div class="pricing-grid">
            <div class="card pricing-card">
              <div class="pricing-period"><label for="siklusHarga">Siklus pembayaran</label>
                <select class="input" id="siklusHarga"><option value="bulanan">Bulanan</option><option value="tahunan">Tahunan (hemat dua bulan)</option></select></div>
              <p class="sr-only" id="pengumumanHarga" aria-live="polite" aria-atomic="true"></p>
              <p class="plan-scroll-hint">Geser kartu ke samping atau gunakan tombol panah untuk melihat paket lainnya.</p>
              <div class="plan-list">
                ${grupPaket('judulPaketSekolah', 'Paket sekolah', PRICING.school)}
                ${grupPaket('judulPaketSiswa', 'Paket siswa', PRICING.student)}
                ${grupPaket('judulPaketGuruSd', 'Paket guru kelas SD', PRICING.teacherSd)}
                ${grupPaket('judulPaketGuruMapel', 'Paket guru mapel', PRICING.teacherSubject)}
              </div>
              <p class="card-note">Akun orang tua mendapatkan akses melalui sekolah/anak; panduan ini tidak mencantumkan paket harga orang tua tersendiri.</p>
              <p class="card-note">Pembelian dan pembayaran online saat ini dinonaktifkan.</p>
            </div>
            <ul class="benefits">
              <li>${IKON_CEK}<span>Paket sekolah menyesuaikan kapasitas peserta didik dan guru.</span></li>
              <li>${IKON_CEK}<span>Paket guru dan siswa ditampilkan sebagai informasi; transaksi belum tersedia.</span></li>
              <li>${IKON_CEK}<span>Halaman paket hanya menampilkan informasi; tidak ada transaksi.</span></li>
            </ul>
          </div>
        </div>
      </section>
      <section class="section" id="testimoni" aria-labelledby="judulTesti" hidden>
        <div class="container"><div class="section-head"><p class="kicker">Testimoni pengguna</p>
          <h2 id="judulTesti">Pengalaman warga sekolah</h2></div>
          <div class="testi-grid" id="testiIsi" aria-live="polite"><p class="testi-empty">Memuat testimoni...</p></div>
          <p class="card-note"><a href="#/testimoni">Kirim atau tinjau testimoni</a></p>
        </div>
      </section>
    </main>
    <footer class="site-footer" hidden><div class="container footer-inner">
      <p>&copy; ${new Date().getFullYear()} AI_nnoe Learning Ecosystem. Hak cipta dilindungi.</p>
    </div></footer>`;

  const $ = (selector) => wadah.querySelector(selector);
  const form = $('#formLogin');
  const email = $('#lgnEmail');
  const sandi = $('#lgnSandi');
  const error = $('#lgnError');
  const tombolMasuk = $('#btnMasuk');
  const labelMasuk = tombolMasuk.querySelector('.btn-label');
  const statusLogin = $('#loginStatus');
  const tampilkanError = (message, field = null) => {
    error.textContent = message;
    error.hidden = false;
    if (field) {
      field.setAttribute('aria-invalid', 'true');
      field.setAttribute('aria-describedby', error.id);
    }
  };
  const hapusError = () => {
    error.textContent = '';
    error.hidden = true;
    [email, sandi].forEach((field) => {
      field.removeAttribute('aria-invalid');
      field.removeAttribute('aria-describedby');
    });
  };
  let captchaWidget = null;
  let captchaSetupError = null;
  const captchaReady = TURNSTILE_SITE_KEY
    ? pasangTurnstile($('#loginCaptcha'), TURNSTILE_SITE_KEY)
      .then((widget) => { captchaWidget = widget; })
      .catch((err) => { captchaSetupError = err; })
    : Promise.resolve();
  const ambilCaptchaToken = async () => {
    await captchaReady;
    if (captchaSetupError) throw captchaSetupError;
    if (!TURNSTILE_SITE_KEY) return undefined;
    const token = captchaWidget?.token();
    if (!token) throw new Error('Selesaikan verifikasi Cloudflare sebelum melanjutkan.');
    return token;
  };

  let testimoniDiminta = false;
  wadah.querySelectorAll('[data-ke]').forEach((link) => {
    link.addEventListener('click', (event) => {
      event.preventDefault();
      const tujuan = link.dataset.ke;
      const panelId = ['fitur', 'harga', 'testimoni'].includes(tujuan) ? tujuan : 'top';
      const panel = panelId === 'top' ? wadah.querySelector('.hero') : wadah.querySelector(`#${panelId}`);
      if (!panel) return;

      wadah.dataset.publicView = panelId;
      wadah.querySelectorAll('main > section').forEach((bagian) => {
        bagian.hidden = bagian !== panel;
      });
      wadah.querySelectorAll('.nav [data-ke]').forEach((tautan) => {
        if (['fitur', 'harga', 'testimoni'].includes(tautan.dataset.ke)) {
          if (tautan.dataset.ke === panelId) tautan.setAttribute('aria-current', 'page');
          else tautan.removeAttribute('aria-current');
        }
      });

      if (panelId === 'testimoni' && !testimoniDiminta) {
        testimoniDiminta = true;
        muatTestimoni(wadah);
      }

      if (tujuan === 'masuk') {
        email.focus({ preventScroll: true });
      } else {
        const judul = panel.querySelector('h1, h2');
        if (judul) {
          judul.setAttribute('tabindex', '-1');
          judul.focus({ preventScroll: true });
        }
      }
    });
  });

  $('#siklusHarga').addEventListener('change', (event) => {
    const siklus = event.target.value;
    daftarPaket.forEach((paket) => {
      const harga = wadah.querySelector(`[data-plan-id="${paket.id}"]`);
      harga.innerHTML = `${formatRupiah(hargaSiklus(paket, siklus))}<small> / ${siklus === 'tahunan' ? 'tahun' : 'bulan'}</small>`;
    });
    $('#pengumumanHarga').textContent = `Harga diperbarui untuk pembayaran ${siklus === 'tahunan' ? 'tahunan' : 'bulanan'}.`;
  });
  $('#btnLihat').addEventListener('click', (event) => {
    const terlihat = sandi.type === 'password';
    sandi.type = terlihat ? 'text' : 'password';
    event.currentTarget.textContent = terlihat ? 'Sembunyikan' : 'Tampilkan';
    event.currentTarget.setAttribute('aria-pressed', String(terlihat));
    sandi.focus();
  });
  email.addEventListener('input', hapusError);
  sandi.addEventListener('input', hapusError);

  $('#btnLupaSandi').addEventListener('click', async (event) => {
    event.preventDefault();
    const alamat = email.value.trim();
    if (!alamat || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(alamat)) {
      tampilkanError('Masukkan alamat email yang valid sebelum meminta reset kata sandi.', email);
      email.focus();
      return;
    }
    try {
      await resetPassword(alamat, await ambilCaptchaToken());
      toast(`Tautan reset kata sandi dikirim ke ${alamat}.`, 'success', 8000);
      captchaWidget?.reset();
    } catch (err) {
      tampilkanError(err?.message || PESAN_AUTH[err?.code] || 'Tidak dapat mengirim email reset. Coba lagi nanti.');
      captchaWidget?.reset();
    }
  });

  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    hapusError();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.value.trim())) {
      tampilkanError('Masukkan alamat email yang valid.', email);
      email.focus();
      return;
    }
    if (sandi.value.length < 6) {
      tampilkanError('Kata sandi minimal 6 karakter.', sandi);
      sandi.focus();
      return;
    }
    tombolMasuk.disabled = true;
    labelMasuk.textContent = 'Memeriksa...';
    statusLogin.textContent = 'Menghubungi Supabase Auth...';
    statusLogin.hidden = false;
    try {
      await login(email.value.trim(), sandi.value, await ambilCaptchaToken());
      toast('Berhasil masuk. Mengalihkan...', 'success', 3000);
      window.location.hash = '#/dashboard';
      window.dispatchEvent(new HashChangeEvent('hashchange'));
    } catch (err) {
      console.error('[login]', err);
      statusLogin.hidden = true;
      tampilkanError(pesanLogin(err));
      captchaWidget?.reset();
      tombolMasuk.disabled = false;
      labelMasuk.textContent = 'Masuk';
      sandi.select();
    }
  });

  const tombolGoogle = $('#btnGoogle');
  tombolGoogle.addEventListener('click', async () => {
    tombolGoogle.disabled = true;
    statusLogin.textContent = 'Membuka jendela autentikasi Google...';
    statusLogin.hidden = false;
    const timerTungguGoogle = setTimeout(() => {
      statusLogin.textContent = 'Masih menunggu Google. Selesaikan atau tutup jendela Google yang terbuka; jika tidak muncul, izinkan popup untuk situs ini.';
    }, 12000);
    try {
      await masukGoogle(await ambilCaptchaToken());
      toast('Login Google berhasil. Mengalihkan...', 'success', 2000);
      window.location.hash = '#/dashboard';
      window.dispatchEvent(new HashChangeEvent('hashchange'));
    } catch (err) {
      console.error('[login] Google:', err);
      statusLogin.hidden = true;
      tampilkanError(pesanLogin(err, true));
      tombolGoogle.disabled = false;
      captchaWidget?.reset();
    } finally {
      clearTimeout(timerTungguGoogle);
    }
  });

  return () => captchaWidget?.remove();
}
