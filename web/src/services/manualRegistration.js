const WHATSAPP_MESSAGE = 'Halo Admin AI_nnoe. Saya sudah mengisi formulir permintaan pendaftaran dan akan melampirkan PDF secara manual. Mohon konfirmasi penerimaan dan tindak lanjut. Saya memahami pesan ini bukan bukti pembayaran atau aktivasi layanan.';

export function buatTautanWhatsAppPemilik(nomor) {
  const normalized = String(nomor ?? '').replace(/[\s()-]/g, '');
  if (!/^\+[1-9]\d{7,14}$/.test(normalized)) return '';
  return `https://wa.me/${normalized.slice(1)}?text=${encodeURIComponent(WHATSAPP_MESSAGE)}`;
}

export function nomorWhatsAppPemilikTersedia(nomor) {
  return Boolean(buatTautanWhatsAppPemilik(nomor));
}
