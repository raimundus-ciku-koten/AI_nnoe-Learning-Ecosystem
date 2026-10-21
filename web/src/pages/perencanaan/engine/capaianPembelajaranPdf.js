import * as pdfjs from 'pdfjs-dist';
import pdfWorkerUrl from 'pdfjs-dist/build/pdf.worker.min.mjs?url';
import { parseCapaianPembelajaranText } from './capaianPembelajaran.js';

const MAX_PDF_SIZE = 10 * 1024 * 1024;
const MAX_PAGES = 200;
const MAX_EXTRACTED_TEXT = 250_000;

pdfjs.GlobalWorkerOptions.workerSrc = pdfWorkerUrl;

export async function bacaCapaianDariPdf(bytes, context) {
  if (!(bytes instanceof Uint8Array) || bytes.length < 5 ||
      bytes.length > MAX_PDF_SIZE ||
      new TextDecoder().decode(bytes.subarray(0, 5)) !== '%PDF-') {
    throw new TypeError('Pilih PDF sumber yang valid dan berukuran maksimal 10 MB.');
  }
  const document = await pdfjs.getDocument({
    data: bytes.slice(),
    isEvalSupported: false,
    stopAtErrors: true,
  }).promise;
  try {
    if (!Number.isInteger(document.numPages) || document.numPages < 1 ||
        document.numPages > MAX_PAGES) {
      throw new Error(`PDF sumber harus berisi 1 sampai ${MAX_PAGES} halaman.`);
    }
    const pages = [];
    let length = 0;
    for (let pageNumber = 1; pageNumber <= document.numPages; pageNumber++) {
      const page = await document.getPage(pageNumber);
      const content = await page.getTextContent({ includeMarkedContent: false });
      const text = content.items
        .filter((item) => typeof item.str === 'string')
        .map((item) => `${item.str}${item.hasEOL ? '\n' : ' '}`)
        .join('');
      length += text.length;
      if (length > MAX_EXTRACTED_TEXT) {
        throw new Error('Teks PDF melebihi batas ekstraksi aman 250.000 karakter.');
      }
      pages.push(text);
      page.cleanup();
    }
    return parseCapaianPembelajaranText({
      ...context,
      text: pages.join('\n'),
    });
  } finally {
    await document.destroy();
  }
}
