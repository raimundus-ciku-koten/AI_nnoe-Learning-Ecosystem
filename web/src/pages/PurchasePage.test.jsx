import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import PurchasePage from './PurchasePage.jsx';
import { KELOMPOK_PAKET, NOMOR_WHATSAPP_OWNER } from '../services/publicPricing.js';

describe('informasi harga dan kontak owner', () => {
  it('menampilkan semua harga katalog tahunan dan ekuivalen bulanan', () => {
    const html = renderToStaticMarkup(React.createElement(PurchasePage));
    const planCount = KELOMPOK_PAKET.reduce((count, group) => count + group.plans.length, 0);

    expect(html.match(/<article class="ale-purchase-card"/g)).toHaveLength(planCount);
    for (const group of KELOMPOK_PAKET) {
      expect(html).toContain(group.label);
      for (const plan of group.plans) expect(html).toContain(plan.name);
    }
    expect(html).toContain('Rp 2.990.000');
    expect(html).toContain('Rp 299.000');
    expect(html).toContain('bulan, ekuivalen');
  });

  it('menghubungkan kontak owner ke WhatsApp dan tidak menyediakan checkout', () => {
    const html = renderToStaticMarkup(React.createElement(PurchasePage));

    expect(html).toContain(`+${NOMOR_WHATSAPP_OWNER}`);
    expect(html).toContain(`https://wa.me/${NOMOR_WHATSAPP_OWNER}`);
    expect(html).toContain('Hubungi owner melalui WhatsApp');
    expect(html).not.toContain('Bayar sekarang');
    expect(html).not.toContain('Checkout');
    expect(html).not.toContain('Pilih siklus tagihan');
  });
});
