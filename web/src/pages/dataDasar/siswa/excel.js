import { strFromU8, unzipSync } from 'fflate';

const MAX_ROWS = 201;
const MAX_ARCHIVE_ENTRIES = 100;
const MAX_UNCOMPRESSED_BYTES = 5_000_000;

function arsipExcelDibatasi(bytes) {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const endMinimum = Math.max(0, bytes.length - 65_557);
  let endOffset = -1;
  for (let offset = bytes.length - 22; offset >= endMinimum; offset -= 1) {
    if (view.getUint32(offset, true) === 0x06054b50) {
      endOffset = offset;
      break;
    }
  }
  if (endOffset < 0) throw new Error('Struktur berkas .xlsx tidak valid.');

  const entryCount = view.getUint16(endOffset + 10, true);
  const directorySize = view.getUint32(endOffset + 12, true);
  let offset = view.getUint32(endOffset + 16, true);
  if (entryCount > MAX_ARCHIVE_ENTRIES || offset + directorySize > endOffset) {
    throw new Error('Struktur berkas Excel terlalu besar atau tidak didukung.');
  }

  let totalUncompressed = 0;
  const decoder = new TextDecoder();
  for (let entry = 0; entry < entryCount; entry += 1) {
    if (offset + 46 > bytes.length || view.getUint32(offset, true) !== 0x02014b50) {
      throw new Error('Struktur berkas .xlsx tidak valid.');
    }
    const uncompressedSize = view.getUint32(offset + 24, true);
    const fileNameLength = view.getUint16(offset + 28, true);
    const extraLength = view.getUint16(offset + 30, true);
    const commentLength = view.getUint16(offset + 32, true);
    if (uncompressedSize === 0xffffffff) {
      throw new Error('Berkas Excel berukuran besar (ZIP64) belum didukung.');
    }
    totalUncompressed += uncompressedSize;
    if (totalUncompressed > MAX_UNCOMPRESSED_BYTES) {
      throw new Error('Isi berkas Excel setelah dibuka melebihi batas 5 MB.');
    }
    offset += 46 + fileNameLength + extraLength + commentLength;
  }
}

function validasiTanpaRumus(bytes) {
  arsipExcelDibatasi(bytes);
  const files = unzipSync(bytes);
  for (const [path, content] of Object.entries(files)) {
    if (/^xl\/worksheets\/[^/]+\.xml$/i.test(path)
      && /<(?:[a-z\d_]+:)?f(?=[\s/>])/i.test(strFromU8(content))) {
      throw new Error('Lembar kerja berisi rumus. Ganti rumus dengan nilainya sebelum mengimpor.');
    }
  }
}

function cellText(value, row, column) {
  if (value === null || value === undefined) return '';
  if (value instanceof Date) return value.toISOString();
  if (['string', 'number', 'boolean'].includes(typeof value)) return String(value);
  throw new Error(`Format sel pada baris ${row}, kolom ${column} belum didukung.`);
}

function quoteCell(value) {
  return `"${String(value).replace(/"/g, '""')}"`;
}

export async function bacaExcelSiswa(file) {
  if (!file || !Number.isFinite(file.size) || file.size <= 0 || file.size > 1_000_000) {
    throw new Error('Berkas Excel harus berukuran antara 1 byte dan 1 MB.');
  }
  if (!/\.xlsx$/i.test(file.name || '')) {
    throw new Error('Gunakan berkas Excel .xlsx. Format .xls lama belum didukung.');
  }

  const bytes = new Uint8Array(await file.arrayBuffer());
  validasiTanpaRumus(bytes);

  const { readSheet } = typeof window === 'undefined'
    ? await import('read-excel-file/universal')
    : await import('read-excel-file/browser');
  const rows = await readSheet(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength), 1);
  const nonEmptyRows = rows.filter((row) => row.some((value) => value !== null && value !== undefined && value !== ''));
  if (!nonEmptyRows.length) throw new Error('Lembar kerja Excel kosong.');
  if (nonEmptyRows.length > MAX_ROWS) {
    throw new Error(`Maksimal ${MAX_ROWS - 1} baris data termasuk satu baris judul.`);
  }

  return nonEmptyRows.map((row, rowIndex) => (
    row.map((value, columnIndex) => quoteCell(cellText(value, rowIndex + 1, columnIndex + 1))).join('\t')
  )).join('\n');
}
