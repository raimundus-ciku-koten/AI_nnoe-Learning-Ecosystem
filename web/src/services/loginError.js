const PESAN_AUTH = {
  invalid_credentials: 'Email atau kata sandi tidak sesuai.',
  invalid_email: 'Format email tidak valid.',
  invalid_captcha: 'Verifikasi keamanan tidak valid. Selesaikan kembali pemeriksaan Cloudflare.',
  captcha_failed: 'Verifikasi keamanan gagal. Selesaikan kembali pemeriksaan Cloudflare.',
  email_not_confirmed: 'Email belum dikonfirmasi. Periksa kotak masuk Anda.',
  user_banned: 'Akun ini dinonaktifkan. Hubungi admin sekolah.',
  over_request_rate_limit: 'Terlalu banyak percobaan. Tunggu beberapa saat.',
  over_email_send_rate_limit: 'Batas pengiriman email tercapai. Tunggu sebelum mencoba lagi.',
  otp_expired: 'Tautan masuk kedaluwarsa. Minta tautan baru.',
  'auth/workspace-account-not-provisioned': 'Akun Google belum terdaftar aktif. Hubungi administrator sekolah.',
  '42501': 'Izin akses profil Supabase ditolak. Periksa status akun dan peran Anda.',
  PGRST116: 'Profil akun tidak ditemukan. Hubungi administrator sekolah.',
};

export function buatErrorCaptcha(message) {
  const error = new Error(message);
  error.code = 'captcha_verification_failed';
  return error;
}

export function pesanLogin(error, google = false) {
  const code = error?.code;
  if (code === 'captcha_verification_failed') return error.message;

  const message = PESAN_AUTH[code]
    || (google
      ? 'Login Google gagal. Pastikan provider Google dan URL pengalihan telah dikonfigurasi di Supabase Auth.'
      : 'Tidak dapat masuk saat ini. Silakan coba lagi.');
  const diagnostic = code ? ` (kode: ${code})` : '';
  return `${message}${diagnostic}`;
}
