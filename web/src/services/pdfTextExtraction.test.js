import { describe, expect, it } from 'vitest';
import { ekstrakTeksPdf } from './pdfTextExtraction.js';

describe('PDF text extraction', () => {
  it('rejects invalid signatures and PDFs beyond the local size limit', async () => {
    await expect(ekstrakTeksPdf(new Uint8Array([1, 2, 3, 4, 5]))).rejects.toThrow('PDF yang valid');
    const oversizedPdf = new Uint8Array(10 * 1024 * 1024 + 1);
    oversizedPdf.set(new TextEncoder().encode('%PDF-'));
    await expect(ekstrakTeksPdf(oversizedPdf)).rejects.toThrow('maksimal 10 MB');
  });
});
