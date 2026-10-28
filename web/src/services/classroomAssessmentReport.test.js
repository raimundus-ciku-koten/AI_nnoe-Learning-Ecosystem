import { describe, expect, it } from 'vitest';
import { klasifikasiTindakLanjut } from './classroomAssessmentReport.js';

const rows = [
  { id: 'low', score: 59 },
  { id: 'at-remedial-boundary', score: 60 },
  { id: 'middle', score: 79 },
  { id: 'at-enrichment-boundary', score: 80 },
  { id: 'ungraded', score: null },
];

describe('klasifikasiTindakLanjut', () => {
  it('applies explicit teacher-selected criteria only to graded work', () => {
    expect(klasifikasiTindakLanjut(rows, { remedial: 60, enrichment: 80 }))
      .toEqual([
        { id: 'low', score: 59, followUp: 'Tinjau untuk remedial' },
        { id: 'at-remedial-boundary', score: 60, followUp: 'Dalam rentang kriteria' },
        { id: 'middle', score: 79, followUp: 'Dalam rentang kriteria' },
        { id: 'at-enrichment-boundary', score: 80, followUp: 'Tinjau untuk pengayaan' },
      ]);
  });

  it.each([
    { remedial: -1, enrichment: 80 },
    { remedial: 60, enrichment: 101 },
    { remedial: 80, enrichment: 80 },
  ])('rejects invalid or conflicting thresholds: %o', (thresholds) => {
    expect(() => klasifikasiTindakLanjut(rows, thresholds))
      .toThrow('Kriteria peninjauan tindak lanjut tidak valid.');
  });

  it('rejects malformed assessment rows instead of returning partial classifications', () => {
    expect(() => klasifikasiTindakLanjut([{ id: 'invalid', score: Number.NaN }], {
      remedial: 60,
      enrichment: 80,
    })).toThrow('Baris peninjauan tindak lanjut tidak valid.');
  });
});
