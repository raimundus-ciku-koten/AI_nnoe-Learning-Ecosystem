import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { IDBFactory, IDBKeyRange } from 'fake-indexeddb';

const { getDocument } = vi.hoisted(() => ({ getDocument: vi.fn() }));
vi.mock('pdfjs-dist', () => ({
  GlobalWorkerOptions: {},
  getDocument,
}));
vi.mock('pdfjs-dist/build/pdf.worker.min.mjs?url', () => ({ default: 'pdf-worker.js' }));

import {
  cariKonteksDokumenLokal,
  daftarDokumenBelajarLokal,
  hapusDokumenBelajarLokal,
  indeksDokumenBelajarLokal,
} from './localStudyDocuments.js';

function buatFile(name = 'materi.pdf', content = '%PDF-sample') {
  const bytes = new TextEncoder().encode(content);
  return {
    name,
    size: bytes.length,
    arrayBuffer: async () => bytes.slice().buffer,
  };
}

function siapkanPdfPage(textByPage) {
  const destroy = vi.fn();
  getDocument.mockReturnValue({
    promise: Promise.resolve({
      numPages: textByPage.length,
      getPage: vi.fn(async (pageNumber) => ({
        getTextContent: async () => ({
          items: [{ str: textByPage[pageNumber - 1], hasEOL: true }],
        }),
        cleanup: vi.fn(),
      })),
      destroy,
    }),
  });
  return { destroy };
}

describe('local study document RAG', () => {
  beforeEach(() => {
    globalThis.indexedDB = new IDBFactory();
    globalThis.IDBKeyRange = IDBKeyRange;
    vi.clearAllMocks();
  });

  afterEach(() => {
    delete globalThis.indexedDB;
    delete globalThis.IDBKeyRange;
  });

  it('validates PDF input before parsing or storing it', async () => {
    await expect(indeksDokumenBelajarLokal('student-1', buatFile('bad.pdf', 'not a pdf')))
      .rejects.toThrow('bukan PDF yang valid');
    await expect(indeksDokumenBelajarLokal('', buatFile()))
      .rejects.toThrow('Akun lokal dokumen tidak valid');
    expect(getDocument).not.toHaveBeenCalled();
  });

  it('indexes readable PDF text locally and isolates retrieval by account', async () => {
    const { destroy } = siapkanPdfPage([
      'Fotosintesis menggunakan klorofil untuk mengubah energi cahaya menjadi energi kimia.',
      'Kloroplas menjadi tempat utama berlangsungnya proses fotosintesis pada tumbuhan.',
    ]);
    const indexed = await indeksDokumenBelajarLokal('student-1', buatFile('biologi.pdf'));
    const otherOwner = await daftarDokumenBelajarLokal('student-2');
    const ownerDocs = await daftarDokumenBelajarLokal('student-1');
    const context = await cariKonteksDokumenLokal('student-1', 'bagaimana klorofil membantu fotosintesis?');
    const otherContext = await cariKonteksDokumenLokal('student-2', 'klorofil fotosintesis');

    expect(indexed).toMatchObject({ name: 'biologi.pdf', pageCount: 2, chunkCount: 2 });
    expect(ownerDocs).toHaveLength(1);
    expect(otherOwner).toEqual([]);
    expect(context[0]).toMatchObject({ name: 'biologi.pdf', page: 1 });
    expect(context[0].text).toContain('energi cahaya');
    expect(otherContext).toEqual([]);
    expect(destroy).toHaveBeenCalledOnce();
  });

  it('rejects image-only PDFs and reports that text cannot be retrieved', async () => {
    const { destroy } = siapkanPdfPage(['', '   ']);
    await expect(indeksDokumenBelajarLokal('student-1', buatFile()))
      .rejects.toThrow('tidak berisi teks yang dapat dibaca');
    expect(destroy).toHaveBeenCalledOnce();
    expect(await daftarDokumenBelajarLokal('student-1')).toEqual([]);
  });

  it('deletes only the owner document and rejects invalid search ranges', async () => {
    siapkanPdfPage(['Sistem tata surya memiliki delapan planet yang mengorbit Matahari.']);
    const indexed = await indeksDokumenBelajarLokal('student-1', buatFile('sains.pdf'));
    expect(await hapusDokumenBelajarLokal('student-2', indexed.id)).toBe(false);
    expect(await daftarDokumenBelajarLokal('student-1')).toHaveLength(1);
    expect(await hapusDokumenBelajarLokal('student-1', indexed.id)).toBe(true);
    expect(await daftarDokumenBelajarLokal('student-1')).toEqual([]);
    await expect(cariKonteksDokumenLokal('student-1', '')).rejects.toThrow('tidak valid');
    await expect(hapusDokumenBelajarLokal('student-1', '')).rejects.toThrow('ID dokumen lokal tidak valid');
  });
});
