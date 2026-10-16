// web/src/pages/dataDasar/siswa/gaya.js
/**
 * Gaya khusus tab Siswa, dipasang SEKALI per dokumen.
 *
 * Memakai constructable stylesheet (adoptedStyleSheets) sehingga tidak butuh
 * `style-src 'unsafe-inline'` pada Content-Security-Policy. Browser lama
 * jatuh ke elemen <style> di <head>.
 */
const GAYA = `
  .sis { color-scheme: light dark; }
  .sis .sis-peringatan { margin-bottom: 12px; }
  .sis .sis-galat { display: block; margin-top: 4px; font-size: .85em; color: #b91c1c; color: light-dark(#b91c1c, #fca5a5); }
  .sis .input[aria-invalid="true"] { border-color: #b91c1c; }
  .sis .sis-badge {
    display: inline-block; margin-left: 6px; padding: 1px 8px; border-radius: 999px;
    font-size: .75em; font-weight: 600; background: #fef3c7; color: #92400e; white-space: nowrap;
  }
  .sis .sis-bar-pilih {
    display: flex; flex-wrap: wrap; gap: 8px; align-items: center;
    margin: 0 0 12px; padding: 8px 12px; border-radius: 10px; background: rgba(20, 184, 166, .12);
  }
  .sis [hidden] { display: none !important; }
  .sis .sis-pratinjau { margin-top: 12px; }
  .sis .sis-pratinjau-wrap { max-height: 320px; overflow: auto; }
  .sis .sis-status { font-weight: 600; white-space: nowrap; }
  .sis .sis-status-ok { color: #047857; color: light-dark(#047857, #6ee7b7); }
  .sis .sis-status-periksa { color: #92400e; color: light-dark(#92400e, #fcd34d); }
  .sis .sis-status-lewati { color: #b91c1c; color: light-dark(#b91c1c, #fca5a5); }
  .sis .sis-dialog {
    width: min(92vw, 420px); border: 0; border-radius: 14px; padding: 20px 22px;
    color: CanvasText; background: Canvas; box-shadow: 0 20px 60px rgba(0, 0, 0, .35);
  }
  .sis .sis-dialog::backdrop { background: rgba(15, 23, 42, .55); }
  .sis .sis-dialog h3 { margin: 0 0 8px; font-size: 1.1rem; }
  .sis .sis-dialog p { margin: 0 0 18px; line-height: 1.5; }
  .sis .sis-dialog-aksi { display: flex; justify-content: flex-end; gap: 8px; }
`;

let terpasang = false;

export function pasangGaya() {
  if (terpasang || typeof document === 'undefined') return;
  terpasang = true;
  try {
    if ('adoptedStyleSheets' in document && 'replaceSync' in CSSStyleSheet.prototype) {
      const lembar = new CSSStyleSheet();
      lembar.replaceSync(GAYA);
      document.adoptedStyleSheets = [...document.adoptedStyleSheets, lembar];
      return;
    }
  } catch { /* jatuh ke <style> */ }
  const el = document.createElement('style');
  el.id = 'sis-gaya';
  el.textContent = GAYA;
  document.head.appendChild(el);
}
