import React from 'react';
import {
  formatRupiah,
  hargaEkuivalenBulanan,
  KELOMPOK_PAKET,
  NOMOR_WHATSAPP_OWNER,
  tautanWhatsApp,
} from '../services/publicPricing.js';
import '../styles/purchase.css';

export default function PurchasePage() {
  return (
    <main className="ale-purchase" aria-labelledby="package-pricing-title">
      <header className="ale-purchase-header">
        <p className="ale-purchase-kicker">Harga paket</p>
        <h1 id="package-pricing-title">Pilih paket yang sesuai</h1>
        <p>Harga informatif bersumber dari katalog. Hubungi owner melalui WhatsApp untuk bertanya tentang ketentuan paket.</p>
        <a
          className="ale-purchase-contact"
          href={tautanWhatsApp()}
          target="_blank"
          rel="noopener noreferrer"
        >
          Hubungi owner melalui WhatsApp
        </a>
        <small className="ale-purchase-number">WhatsApp: +{NOMOR_WHATSAPP_OWNER}</small>
      </header>

      <p className="ale-purchase-message ale-purchase-message-info" role="note">
        Harga bulanan merupakan ekuivalen katalog tahunan dibagi 10. Daftar ini merupakan informasi
        harga saja; hubungi owner untuk konfirmasi ketentuan.
      </p>

      {KELOMPOK_PAKET.map((group) => (
        <section className="ale-purchase-group" key={group.id} aria-labelledby={`package-${group.id}`}>
          <h2 id={`package-${group.id}`}>{group.label}</h2>
          <div className="ale-purchase-grid">
            {group.plans.map((plan) => (
              <article className="ale-purchase-card" key={plan.id}>
                <h3>{plan.name}</h3>
                <p className="ale-purchase-price">
                  {formatRupiah(plan.annualPrice)} <small>/ tahun</small>
                </p>
                <p className="ale-purchase-monthly">
                  {formatRupiah(hargaEkuivalenBulanan(plan.annualPrice))} <small>/ bulan, ekuivalen</small>
                </p>
                <a href={tautanWhatsApp(plan.name)} target="_blank" rel="noopener noreferrer">
                  Tanya paket ini melalui WhatsApp
                </a>
              </article>
            ))}
          </div>
        </section>
      ))}
    </main>
  );
}
