import * as pdfjs from 'pdfjs-dist';
import pdfWorkerUrl from 'pdfjs-dist/build/pdf.worker.min.mjs?url';
import { parseQuestions } from './soalPdfParser.js';

const MAX_PDF_SIZE = 10 * 1024 * 1024;
const MAX_PAGES = 200;
const MAX_EXTRACTED_TEXT = 250_000;

pdfjs.GlobalWorkerOptions.workerSrc = pdfWorkerUrl;

export async function bacaSoalDariPdf(file) {
  if (!file || file.type !== 'application/pdf' ||
      file.size < 5 || file.size > MAX_PDF_SIZE) {
    throw new TypeError('Pilih PDF soal berukuran maksimal 10 MB.');
  }

  const bytes = new Uint8Array(await file.arrayBuffer());
  if (new TextDecoder().decode(bytes.subarray(0, 5)) !== '%PDF-') {
    throw new TypeError('Berkas yang dipilih bukan PDF yang valid.');
  }
  const document = await pdfjs.getDocument({
    data: bytes,
    isEvalSupported: false,
    stopAtErrors: true,
  }).promise;

  try {
    if (!Number.isInteger(document.numPages) || document.numPages < 1 ||
        document.numPages > MAX_PAGES) {
      throw new Error(`PDF harus berisi 1 sampai ${MAX_PAGES} halaman.`);
    }
    const pages = [];
    let length = 0;
    for (let pageNumber = 1; pageNumber <= document.numPages; pageNumber += 1) {
      const page = await document.getPage(pageNumber);
      const content = await page.getTextContent({ includeMarkedContent: false });
      const lines = [];
      let previousY = null;
      for (const item of content.items) {
        if (typeof item.str !== 'string') continue;
        const y = item.transform?.[5];
        if (previousY !== null && Number.isFinite(y) &&
            Math.abs(previousY - y) > 2) lines.push('\n');
        lines.push(item.str);
        if (item.hasEOL) lines.push('\n');
        else lines.push(' ');
        if (Number.isFinite(y)) previousY = y;
      }
      const pageText = lines.join('');
      length += pageText.length;
      if (length > MAX_EXTRACTED_TEXT) {
        throw new Error('Teks PDF melebihi batas ekstraksi aman 250.000 karakter.');
      }
      pages.push(pageText);
      page.cleanup();
    }
    return parseQuestions(pages.join('\n'));
  } finally {
    await document.destroy();
  }
}
