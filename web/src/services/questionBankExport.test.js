import { describe, expect, it } from 'vitest';

import { buatCsvSoalCanva } from './questionBankExport.js';

const question = {
  mapel: 'Matematika',
  kelas: 'X',
  jenis: 'pilihan_ganda',
  pertanyaan: 'Berapakah 2 + 2?',
  pilihan: ['3', '4'],
  jawaban: '4',
  pembahasan: 'Hasil penjumlahan.',
};

describe('ekspor bank soal ke CSV Canva', () => {
  it('creates a spreadsheet-compatible CSV with question fields and empty choices', () => {
    const csv = buatCsvSoalCanva([question]);
    expect(csv.startsWith('\uFEFF')).toBe(true);
    expect(csv).toContain('"Mata Pelajaran","Kelas","Bentuk Soal","Pertanyaan"');
    expect(csv).toContain('"Matematika","X","Pilihan ganda","Berapakah 2 + 2?","3","4","","","","4","Hasil penjumlahan."');
  });

  it('escapes quotes and prefixes formula-like cells to prevent spreadsheet execution', () => {
    const csv = buatCsvSoalCanva([{
      ...question,
      pertanyaan: '=IMPORTXML("https://example.test","//data")',
      pilihan: ['+SUM(1,1)', '-1', '@cmd', '\tvalue', 'Safe'],
      jawaban: '+SUM(1,1)',
    }]);
    expect(csv).toContain(`"'=IMPORTXML(""https://example.test"",""//data"")"`);
    expect(csv).toContain(`"'+SUM(1,1)"`);
    expect(csv).toContain(`"'-1","'@cmd","'\tvalue","Safe"`);
  });

  it('rejects empty or malformed exports', () => {
    expect(() => buatCsvSoalCanva([])).toThrow('1 sampai 100 soal');
    expect(() => buatCsvSoalCanva([{ ...question, jenis: 'essay' }])).toThrow('Format soal');
  });
});
