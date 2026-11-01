export const PESAN_AUTH = {
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
  PGRST116: 'Profil akun tidak ditemukan. Hubungi administrator sekolah.',
};

const PESAN_GOOGLE_AUTH = {
  app_origin_not_configured:
    'Login Google belum dikonfigurasi untuk deployment ini. Administrator perlu menetapkan APP_ORIGIN pada lingkungan Vercel dan mengizinkan URL callback deployment ini di Supabase Auth.',
  app_origin_invalid:
    'URL aplikasi untuk login Google tidak valid. Administrator perlu memperbaiki APP_ORIGIN pada lingkungan Vercel.',
  app_origin_insecure:
    'Login Google memerlukan APP_ORIGIN HTTPS yang valid pada lingkungan Vercel.',
  origin_mismatch:
    'Domain yang dibuka tidak cocok dengan APP_ORIGIN pada lingkungan Vercel. Hubungi administrator.',
  auth_not_configured:
    'Autentikasi server belum dikonfigurasi. Hubungi administrator.',
  auth_upstream_unavailable:
    'Layanan autentikasi Supabase tidak dapat dijangkau. Coba lagi nanti.',
  auth_upstream_timeout:
    'Layanan autentikasi Supabase tidak merespons. Coba lagi nanti.',
  oauth_provider_error:
    'Google membatalkan atau menolak proses autentikasi. Pastikan Google provider aktif dan konfigurasi OAuth Supabase sesuai.',
  oauth_state_invalid:
    'Verifikasi keamanan login Google kedaluwarsa atau tidak cocok. Mulai login kembali.',
  oauth_code_invalid:
    'Google tidak mengembalikan kode autentikasi yang valid. Mulai login kembali.',
};

export function pesanLogin(error, google = false) {
  const code = error?.code;
  const pesanAuth = Object.hasOwn(PESAN_AUTH, code) ? PESAN_AUTH[code] : undefined;
  const pesanGoogleAuth = google && Object.hasOwn(PESAN_GOOGLE_AUTH, code)
    ? PESAN_GOOGLE_AUTH[code]
    : undefined;
  const message = pesanAuth
    || pesanGoogleAuth
    || (google
      ? 'Login Google gagal. Hubungi administrator dengan menyertakan kode kesalahan.'
      : 'Tidak dapat masuk saat ini. Silakan coba lagi.');
  const diagnostic = code ? ` (kode: ${code})` : '';
  return `${message}${diagnostic}`;
}
