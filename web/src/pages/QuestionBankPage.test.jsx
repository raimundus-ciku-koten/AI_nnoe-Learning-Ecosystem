import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';

vi.mock('../context/AuthContext.jsx', () => ({ useAuth: vi.fn() }));
vi.mock('../services/questionBank.js', () => ({
  hapusSoalBank: vi.fn(),
  muatBankSoal: vi.fn(),
  tambahSoalBank: vi.fn(),
  ubahSoalBank: vi.fn(),
}));
vi.mock('../services/aiIntegrations.js', () => ({ buatDrafSoalAI: vi.fn() }));

import { QuestionBankGeneratedDocument } from './QuestionBankPage.jsx';
import QuestionBankPage from './QuestionBankPage.jsx';
import { useAuth } from '../context/AuthContext.jsx';

const bank = {
  input: {
    kategori: 'Latihan Soal',
    judul: 'Persamaan Linear',
    mapel: 'Matematika',
    kelas: 'X',
    topik: 'Persamaan linear satu variabel',
    levelSoal: 'Campuran LOT-MOT-HOT',
  },
  questions: [{
    jenis: 'pilihan_ganda',
    nomor: 1,
    pertanyaan: 'Berapakah hasil 2 + 2?',
    pilihan: ['3', '4', '5', '6'],
  }],
  answers: [{
    jenis: 'pilihan_ganda',
    nomor: 1,
    pertanyaan: 'Berapakah hasil 2 + 2?',
    pilihan: ['3', '4', '5', '6'],
    jawaban: '4',
    pembahasan: 'Dua ditambah dua sama dengan empat.',
    caraCepat: 'Hitung langsung.',
  }],
};

describe('QuestionBankGeneratedDocument', () => {
  it('renders the question, A–D options, answer key, explanation, and document metadata', () => {
    const markup = renderToStaticMarkup(<QuestionBankGeneratedDocument bank={bank} />);

    expect(markup).toContain('Persamaan Linear');
    expect(markup).toContain('Mata pelajaran:');
    expect(markup).toContain('Matematika');
    expect(markup).toContain('Berapakah hasil 2 + 2?');
    expect(markup).toContain('<ol type="A">');
    expect(markup).toContain('Kunci jawaban');
    expect(markup).toContain('Dua ditambah dua sama dengan empat.');
    expect(markup).toContain('Hitung langsung.');
  });

  it('does not render a printable document until all answers are available', () => {
    expect(renderToStaticMarkup(
      <QuestionBankGeneratedDocument bank={{ ...bank, answers: null }} />,
    )).toBe('');
  });

  it('escapes generated text rather than treating it as markup', () => {
    const maliciousText = '<script>alert(1)</script>';
    const markup = renderToStaticMarkup(
      <QuestionBankGeneratedDocument bank={{
        ...bank,
        input: { ...bank.input, judul: maliciousText },
      }} />,
    );

    expect(markup).toContain('&lt;script&gt;alert(1)&lt;/script&gt;');
    expect(markup).not.toContain('<script>');
  });
});

describe('QuestionBankPage', () => {
  it('keeps the local generator available to a teacher without a school tenant', () => {
    useAuth.mockReturnValue({
      user: { uid: 'teacher-1' },
      role: 'guru',
      tenantId: null,
    });

    const markup = renderToStaticMarkup(<QuestionBankPage />);

    expect(markup).toContain('Generator Bank Soal');
    expect(markup).toContain('Generator lokal tetap dapat digunakan');
    expect(markup).not.toContain('Soal tersimpan');
    expect(markup).not.toContain('Simpan soal');
  });
});
