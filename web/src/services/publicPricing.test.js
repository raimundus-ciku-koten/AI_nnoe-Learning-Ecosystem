import { describe, expect, it } from 'vitest';
import {
  escapeHtml,
  formatRupiah,
  hargaEkuivalenBulanan,
  KELOMPOK_PAKET,
  NOMOR_WHATSAPP_OWNER,
  tautanWhatsApp,
} from './publicPricing.js';

describe('public pricing catalog', () => {
  it('formats catalog prices and derives monthly equivalents from the catalog divisor', () => {
    expect(formatRupiah(2_990_000)).toContain('2.990.000');
    expect(hargaEkuivalenBulanan(2_990_000)).toBe(299_000);
    expect(KELOMPOK_PAKET.reduce((count, group) => count + group.plans.length, 0)).toBe(12);
    expect(() => hargaEkuivalenBulanan(-1)).toThrow('Harga katalog tidak valid');
  });

  it('builds encoded WhatsApp inquiries without including personal form data', () => {
    const link = tautanWhatsApp('Sekolah Pro & Guru');
    expect(link).toContain(`https://wa.me/${NOMOR_WHATSAPP_OWNER}?text=`);
    expect(link).toContain(encodeURIComponent('Sekolah Pro & Guru'));
    expect(link).not.toContain('email=');
  });

  it('escapes content before inserting catalog strings into the public landing page', () => {
    expect(escapeHtml('<script>"&\'')).toBe('&lt;script&gt;&quot;&amp;&#39;');
  });
});
