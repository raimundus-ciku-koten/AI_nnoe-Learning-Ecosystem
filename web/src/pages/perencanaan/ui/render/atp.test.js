import { describe, expect, it } from 'vitest';

import { renderAtp } from './atp.js';

class MockNode {
  constructor(text = '', tagName = '') {
    this.childNodes = [];
    this.text = text;
    this.tagName = tagName.toUpperCase();
    this.attributes = {};
    this.listeners = new Map();
    this.value = '';
  }

  append(node) {
    this.childNodes.push(node);
  }

  setAttribute(name, value) {
    this.attributes[name] = String(value);
    if (name === 'value') this.value = String(value);
  }

  getAttribute(name) {
    return this.attributes[name] ?? null;
  }

  get textContent() {
    return this.text + this.childNodes.map((node) => node.textContent).join('');
  }

  get children() {
    return this.childNodes.filter((node) => node.tagName);
  }
}

class MockElement extends MockNode {
  constructor(tagName) {
    super('', tagName);
  }
}

class MockText extends MockNode {
  constructor(text) {
    super(String(text));
  }
}

function renderWithMockDocument(callback) {
  const documentDescriptor = Object.getOwnPropertyDescriptor(globalThis, 'document');
  const nodeDescriptor = Object.getOwnPropertyDescriptor(globalThis, 'Node');
  globalThis.document = {
    createElement: (tagName) => new MockElement(tagName),
    createTextNode: (text) => new MockText(text),
  };
  globalThis.Node = MockNode;
  try {
    callback();
  } finally {
    if (documentDescriptor) Object.defineProperty(globalThis, 'document', documentDescriptor);
    else delete globalThis.document;
    if (nodeDescriptor) Object.defineProperty(globalThis, 'Node', nodeDescriptor);
    else delete globalThis.Node;
  }
}

describe('ATP print renderer', () => {
  it('renders the six legacy sections, nine-column matrix, and unit assessment metadata', () => {
    renderWithMockDocument(() => {
      const output = renderAtp({
        rasionalisasi: 'Urutan belajar bergerak dari konsep ke penerapan.',
        cp: [{ elemen: 'Bilangan', cp: 'Memahami bilangan.' }],
        jpPerPekan: 4,
        totalJP: 16,
        anggaran: { jpPertemuan: 4, uhTotal: 8, sisaTP: 8 },
        unit: [
          {
            no: 1,
            nama: 'Bilangan',
            elemen: 'Bilangan',
            semester: 1,
            tujuanUnit: 'Menggunakan bilangan.',
            kataKunci: ['bilangan'],
            isiProsesPembelajaran: 'Mengamati representasi bilangan.',
            dimensiProfil: ['Bernalar kritis'],
            glosarium: [{ istilah: 'Bilangan', makna: 'Konsep kuantitas.' }],
            tp: [{
              kode: 'A.1',
              rumusan: 'Mengidentifikasi bilangan.',
              materi: 'Bilangan',
              strategiAsesmen: 'Observasi dan tanya jawab.',
              jp: 4,
            }],
          },
          {
            no: 2,
            nama: 'Pola',
            elemen: 'Bilangan',
            semester: 2,
            tujuanUnit: 'Menerapkan bilangan.',
            kataKunci: ['pola'],
            isiProsesPembelajaran: 'Menyelesaikan masalah.',
            dimensiProfil: ['Bernalar kritis'],
            glosarium: [],
            tp: [{
              kode: 'A.2',
              rumusan: 'Menerapkan bilangan.',
              materi: 'Pola bilangan',
              strategiAsesmen: 'Tugas pemecahan masalah.',
              jp: 4,
            }],
          },
        ],
      }, {
        mapel: 'Matematika',
        kelas: 'X',
        fase: 'E',
        tahunAjaran: '2026/2027',
        identitas: {},
      });

      expect(output.textContent).toContain('1. Informasi Umum dan Capaian Pembelajaran');
      expect(output.textContent).toContain('2. Penurunan Capaian Menjadi Tujuan Pembelajaran');
      expect(output.textContent).toContain('3. Rasionalisasi dan Rancangan Unit Pembelajaran');
      expect(output.textContent).toContain('4. Matriks ATP Ringkas');
      expect(output.textContent).toContain('5. Pembagian Alur per Semester');
      expect(output.textContent).toContain('6. Rekap Alokasi Waktu Tahunan');
      expect(output.textContent).toContain('Strategi asesmen');
      expect(output.textContent).toContain('Observasi dan tanya jawab.');
      expect(output.textContent).toContain('16 JP');
    });
  });

  it('marks unavailable legacy metadata instead of inventing a value', () => {
    renderWithMockDocument(() => {
      const output = renderAtp({
        cp: [{ elemen: 'Bilangan', cp: 'Memahami bilangan.' }],
        unit: [{
          no: 1,
          nama: 'Bilangan',
          elemen: 'Bilangan',
          semester: 1,
          tp: [{ kode: 'A.1', rumusan: 'Mengidentifikasi bilangan.', materi: '', jp: 4 }],
        }],
      }, { mapel: 'Matematika', kelas: 'X', fase: 'E', tahunAjaran: '2026/2027', identitas: {} });

      expect(output.textContent).toContain('PERLU KONFIRMASI');
    });
  });
});
