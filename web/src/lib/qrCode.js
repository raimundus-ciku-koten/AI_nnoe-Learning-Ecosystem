import QRCode from 'qrcode';

export function buatSvgQr(teks) {
  return QRCode.toString(String(teks), {
    type: 'svg',
    errorCorrectionLevel: 'Q',
    margin: 4,
    width: 256,
    color: { dark: '#000000', light: '#FFFFFF' },
  });
}
