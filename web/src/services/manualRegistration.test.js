import { describe, expect, it } from 'vitest';
import {
  buatTautanWhatsAppPemilik,
  nomorWhatsAppPemilikTersedia,
} from './manualRegistration.js';

describe('kontak WhatsApp pendaftaran manual', () => {
  it('accepts an international number and pre-fills a generic message only', () => {
    const url = buatTautanWhatsAppPemilik('+62 812-3456-7890');
    expect(url.startsWith('https://wa.me/6281234567890?text=')).toBe(true);
    expect(decodeURIComponent(url)).not.toContain('NPSN');
    expect(decodeURIComponent(url)).not.toContain('pemohon@example.com');
  });

  it('does not create a contact URL for a blank or invalid number', () => {
    expect(buatTautanWhatsAppPemilik('')).toBe('');
    expect(buatTautanWhatsAppPemilik('081234567890')).toBe('');
    expect(nomorWhatsAppPemilikTersedia('not-a-number')).toBe(false);
  });
});
