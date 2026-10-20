// web/src/pages/dataDasar/kartuCetak.js
/**
 * Cetak kartu absensi ukuran ID-1 / CR80 (85,6 × 54 mm).
 * ---------------------------------------------------------------------------
 *  - 10 kartu per lembar A4 (2 kolom × 5 baris), dipecah per halaman secara
 *    eksplisit sehingga tidak bergantung pada perilaku fragmentasi flexbox.
 *  - Dicetak lewat iframe tersembunyi: tidak bergantung pada styles.css
 *    aplikasi dan tidak ikut mencetak sidebar/header.
 *  - Semua teks di-escape. SVG barcode hanya diterima bila berasal dari
 *    encoder (diawali "<svg", tanpa script/handler).
 */
import { esc } from '../../lib/teks.js';

const PER_HALAMAN = 10;
const SVG_AMAN = /^\s*<svg[\s>]/i;
const SVG_BERBAHAYA = /<script|<foreignObject|\son\w+\s*=|javascript:/i;

const CSS = `
  @page { size: A4 portrait; margin: 8mm; }
  * { box-sizing: border-box; margin: 0; padding: 0; }
  html, body { background: #fff; }
  body {
    font-family: system-ui, -apple-system, "Segoe UI", Roboto, Arial, sans-serif;
    color: #111827;
    -webkit-print-color-adjust: exact; print-color-adjust: exact;
  }
  .hal {
    display: grid;
    grid-template-columns: repeat(2, 85.6mm);
    grid-auto-rows: 54mm;
    gap: 2mm;
    justify-content: center;
    align-content: start;
    break-after: page; page-break-after: always;
  }
  .hal:last-child { break-after: auto; page-break-after: auto; }
  .k {
    width: 85.6mm; height: 54mm; overflow: hidden;
    border: .25mm solid #94a3b8; border-radius: 3mm;
    display: flex; flex-direction: column; background: #fff;
    break-inside: avoid; page-break-inside: avoid;
  }
  .k header {
    height: 9mm; padding: 0 4mm; background: #1e1b4b; color: #fff;
    display: flex; align-items: center; justify-content: space-between;
    border-bottom: 1mm solid #14b8a6;
  }
  .k header b { font-size: 3.4mm; letter-spacing: .4mm; }
  .k header span { font-size: 3.2mm; font-weight: 600; }
  .k .isi {
    flex: 1; min-height: 0; padding: 2mm 4mm 2.5mm;
    display: flex; flex-direction: column; align-items: center; text-align: center;
  }
  .k h1 {
    font-size: 3.7mm; line-height: 1.2; font-weight: 700; width: 100%;
    display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden;
  }
  .k .nisn { font-size: 2.9mm; color: #475569; margin-top: .6mm; }
  .k .qr { width: 20mm; height: 20mm; margin-top: .5mm; flex: none; }
  .k .qr svg { display: block; width: 20mm; height: 20mm; }
  .k code { font-family: ui-monospace, Consolas, "Courier New", monospace; font-size: 2.8mm; letter-spacing: .2mm; margin-top: 1mm; }
`;

/**
 * @param {{nama:string, nisn:string, kelas:string, kode:string, qrSvg:string}[]} kartu
 * @param {{judul?:string, brand?:string, onGalat?:(pesan:string)=>void}} [opsi]
 */
export function cetakKartu(kartu, { judul = 'Kartu Absensi', brand = 'AI-NNOE', onGalat } = {}) {
  const lapor = (pesan) => { (onGalat ?? console.error)(pesan); };
  if (!Array.isArray(kartu) || !kartu.length) { lapor('Tidak ada kartu untuk dicetak.'); return; }

  const html = kartu.map((k) => {
    const qrSvg = SVG_AMAN.test(k.qrSvg ?? '') && !SVG_BERBAHAYA.test(k.qrSvg) ? k.qrSvg : '';
    return `
      <article class="k">
        <header><b>${esc(brand)}</b><span>${esc(k.kelas)}</span></header>
        <div class="isi">
          <h1>${esc(k.nama)}</h1>
          <p class="nisn">NISN: ${esc(k.nisn || '-')}</p>
          <div class="qr">${qrSvg}</div>
          <code>${esc(k.kode)}</code>
        </div>
      </article>`;
  });

  const halaman = [];
  for (let i = 0; i < html.length; i += PER_HALAMAN) {
    halaman.push(`<section class="hal">${html.slice(i, i + PER_HALAMAN).join('')}</section>`);
  }

  const dokumen = `<!doctype html><html lang="id"><head><meta charset="utf-8">
    <title>${esc(judul)}</title><style>${CSS}</style></head>
    <body>${halaman.join('')}</body></html>`;

  const iframe = document.createElement('iframe');
  iframe.setAttribute('aria-hidden', 'true');
  iframe.tabIndex = -1;
  iframe.style.cssText = 'position:fixed;right:0;bottom:0;width:1px;height:1px;border:0;opacity:0;pointer-events:none';

  let bersih = false;
  const bersihkan = () => {
    if (bersih) return;
    bersih = true;
    iframe.remove();
  };

  iframe.onload = () => {
    const jendela = iframe.contentWindow;
    if (!jendela) { bersihkan(); return; }
    jendela.addEventListener('afterprint', () => setTimeout(bersihkan, 300), { once: true });
    // Satu frame agar layout & SVG selesai sebelum dialog cetak dibuka.
    requestAnimationFrame(() => {
      try {
        jendela.focus();
        jendela.print();
      } catch (err) {
        console.error('[kartuCetak] gagal mencetak', err);
        lapor('Browser menolak membuka dialog cetak.');
        bersihkan();
      }
    });
  };

  iframe.srcdoc = dokumen;
  document.body.appendChild(iframe);
  setTimeout(bersihkan, 10 * 60 * 1000); // pengaman bila afterprint tidak terpicu
}
