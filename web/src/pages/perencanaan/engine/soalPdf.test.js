import { describe, expect, it } from 'vitest';
import { parseQuestions } from './soalPdfParser.js';

describe('parse questions extracted from PDF text', () => {
  it('groups numbered questions and labeled choices', () => {
    expect(parseQuestions(
      '1. Hasil 2 + 2 adalah?\nA. 2\nB. 3\nC. 4\n2) Ibukota Indonesia?\nA) Bandung\nB) Jakarta',
    )).toEqual([
      { prompt: 'Hasil 2 + 2 adalah?', choices: ['2', '3', '4'] },
      { prompt: 'Ibukota Indonesia?', choices: ['Bandung', 'Jakarta'] },
    ]);
  });

  it('ignores questions without answer choices and long options', () => {
    expect(parseQuestions('1. Uraikan demokrasi.\n2. Pilih?\nA. Satu\nB. Dua')).toEqual([
      { prompt: 'Pilih?', choices: ['Satu', 'Dua'] },
    ]);
  });
});
