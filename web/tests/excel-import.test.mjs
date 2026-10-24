import assert from 'node:assert/strict';
import { test } from 'node:test';
import { strToU8, zipSync } from 'fflate';
import { bacaExcelSiswa } from '../src/pages/dataDasar/siswa/excel.js';
import { uraiImpor } from '../src/pages/dataDasar/siswa/impor.js';

function xmlEscape(value) {
  return String(value).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function fileDariBaris(rows, name = 'siswa.xlsx') {
  const sheetRows = rows.map((row, rowIndex) => {
    const cells = row.map((value, columnIndex) => {
      const address = `${String.fromCharCode(65 + columnIndex)}${rowIndex + 1}`;
      if (value && typeof value === 'object' && 'formula' in value) {
        return `<c r="${address}"><f>${xmlEscape(value.formula)}</f><v>2</v></c>`;
      }
      return `<c r="${address}" t="inlineStr"><is><t>${xmlEscape(value)}</t></is></c>`;
    }).join('');
    return `<row r="${rowIndex + 1}">${cells}</row>`;
  }).join('');
  const content = {
    '[Content_Types].xml': `<?xml version="1.0" encoding="UTF-8"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/></Types>`,
    '_rels/.rels': `<?xml version="1.0" encoding="UTF-8"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>`,
    'xl/workbook.xml': `<?xml version="1.0" encoding="UTF-8"?><workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets><sheet name="Data Siswa" sheetId="1" r:id="rId1"/></sheets></workbook>`,
    'xl/_rels/workbook.xml.rels': `<?xml version="1.0" encoding="UTF-8"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/></Relationships>`,
    'xl/worksheets/sheet1.xml': `<?xml version="1.0" encoding="UTF-8"?><worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetData>${sheetRows}</sheetData></worksheet>`,
  };
  const buffer = zipSync(Object.fromEntries(
    Object.entries(content).map(([path, value]) => [path, strToU8(value)]),
  ));
  const arrayBuffer = buffer.buffer.slice(buffer.byteOffset, buffer.byteOffset + buffer.byteLength);
  return {
    name,
    size: buffer.byteLength,
    arrayBuffer: async () => arrayBuffer,
  };
}

test('Excel .xlsx diubah menjadi data pratinjau dengan kolom bebas urutan', async () => {
  const text = await bacaExcelSiswa(fileDariBaris([
    ['Jenis Kelamin', 'NISN', 'Nama'],
    ['Perempuan', '0123456789', 'Ayu Lestari'],
  ]));
  const rows = uraiImpor(text, { kelas: '7A' });

  assert.equal(rows.length, 1);
  assert.equal(rows[0].nama, 'Ayu Lestari');
  assert.equal(rows[0].nisn, '0123456789');
  assert.equal(rows[0].jk, 'P');
  assert.equal(rows[0].status, 'ok');
});

test('Excel ditolak jika memuat rumus atau lebih dari 200 baris data', async () => {
  await assert.rejects(
    bacaExcelSiswa(fileDariBaris([
      ['Nama', 'NISN', 'L/P'],
      [{ formula: 'CONCAT("A","yu")' }, '0123456789', 'P'],
    ])),
    /berisi rumus/,
  );

  await assert.rejects(
    bacaExcelSiswa(fileDariBaris(Array.from({ length: 202 }, (_, index) => [`Siswa ${index}`]))),
    /Maksimal 200 baris data/,
  );
});

test('Excel lama .xls dan berkas berukuran lebih dari 1 MB ditolak secara eksplisit', async () => {
  await assert.rejects(bacaExcelSiswa({
    name: 'siswa.xls', size: 10, arrayBuffer: async () => new ArrayBuffer(10),
  }), /\.xlsx/);
  await assert.rejects(bacaExcelSiswa({
    name: 'besar.xlsx', size: 1_000_001, arrayBuffer: async () => new ArrayBuffer(0),
  }), /1 MB/);
});
