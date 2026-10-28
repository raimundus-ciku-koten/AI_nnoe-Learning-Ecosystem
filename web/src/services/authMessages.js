export const PESAN_AUTH = Object.freeze({
  invalid_credentials: 'Email atau kata sandi tidak sesuai.',
  invalid_email: 'Format email tidak valid.',
  invalid_captcha: 'Verifikasi keamanan tidak valid. Selesaikan kembali pemeriksaan Cloudflare.',
  captcha_failed: 'Verifikasi keamanan gagal. Selesaikan kembali pemeriksaan Cloudflare.',
  captcha_setup_failed: 'Verifikasi keamanan Cloudflare tidak dapat dimuat. Periksa koneksi atau kebijakan jaringan, lalu coba lagi.',
  captcha_widget_error: 'Cloudflare mengalami kendala saat menampilkan pemeriksaan. Periksa konfigurasi domain widget atau coba browser/jaringan lain.',
  captcha_token_missing: 'Verifikasi keamanan belum selesai. Tunggu sampai pemeriksaan Cloudflare siap, lalu coba lagi.',
  email_not_confirmed: 'Email belum dikonfirmasi. Periksa kotak masuk Anda.',
  user_banned: 'Akun ini dinonaktifkan. Hubungi admin sekolah.',
  over_request_rate_limit: 'Terlalu banyak percobaan. Tunggu beberapa saat.',
  over_email_send_rate_limit: 'Batas pengiriman email tercapai. Tunggu sebelum mencoba lagi.',
  signup_disabled: 'Pendaftaran akun tidak tersedia. Hubungi admin sekolah.',
  otp_expired: 'Tautan masuk kedaluwarsa. Minta tautan baru.',
  'auth/workspace-account-not-provisioned': 'Akun Google belum terdaftar aktif. Hubungi administrator sekolah.',
  '42501': 'Izin akses profil Supabase ditolak. Periksa status akun dan peran Anda.',
  PGRST116: 'Profil akun tidak ditemukan. Hubungi administrator sekolah.',
});

export function pesanLogin(error, google = false) {
  const code = error?.code;
  const message = PESAN_AUTH[code]
    || (google
      ? 'Login Google gagal. Pastikan provider Google dan URL pengalihan telah dikonfigurasi di Supabase Auth.'
      : 'Tidak dapat masuk saat ini. Silakan coba lagi.');
  const providerCode = typeof error?.providerCode === 'string' && /^\d{6}$/.test(error.providerCode)
    ? error.providerCode
    : '';
  const diagnosticCode = providerCode || code;
  const diagnostic = diagnosticCode ? ` (kode: ${diagnosticCode})` : '';
  return `${message}${diagnostic}`;
}
