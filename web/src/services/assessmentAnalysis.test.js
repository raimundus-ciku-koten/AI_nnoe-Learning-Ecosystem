import { describe, expect, it } from 'vitest';
import { ringkasHasilUjian } from './assessmentAnalysis.js';

const result = (overrides = {}) => ({
  attempt_id: 'attempt-1',
  exam_id: 'exam-1',
  title: 'Matematika',
  kelas: '7A',
  student_name: 'Siswa A',
  submitted_at: '2026-10-23T08:00:00.000Z',
  score: 80,
  objective_correct: 8,
  objective_total: 10,
  essay_score: null,
  grade_pending: false,
  ...overrides,
});

describe('assessment result analysis', () => {
  it('aggregates submissions, graded scores, pending essays, and objective accuracy per exam', () => {
    expect(ringkasHasilUjian([
      result(),
      result({
        attempt_id: 'attempt-2',
        student_name: 'Siswa B',
        score: 90,
        objective_correct: 9,
        grade_pending: false,
      }),
      result({
        attempt_id: 'attempt-3',
        student_name: 'Siswa C',
        score: null,
        essay_score: null,
        objective_correct: 7,
        grade_pending: true,
      }),
    ])).toEqual([{
      examId: 'exam-1',
      title: 'Matematika',
      className: '7A',
      submissions: 3,
      gradedSubmissions: 2,
      pendingReview: 1,
      averageScore: 85,
      objectiveCorrect: 24,
      objectiveTotal: 30,
      objectiveAccuracy: 80,
    }]);
  });

  it('keeps exams separate and leaves score metrics empty when no results are graded', () => {
    expect(ringkasHasilUjian([
      result({ grade_pending: true, score: null, objective_total: 0, objective_correct: 0 }),
      result({
        attempt_id: 'attempt-2',
        exam_id: 'exam-2',
        title: 'IPA',
        grade_pending: true,
        score: null,
        objective_total: 0,
        objective_correct: 0,
      }),
    ])).toMatchObject([
      { examId: 'exam-1', averageScore: null, objectiveAccuracy: null, pendingReview: 1 },
      { examId: 'exam-2', title: 'IPA', averageScore: null, objectiveAccuracy: null },
    ]);
  });

  it('rejects malformed analysis inputs', () => {
    expect(() => ringkasHasilUjian(null)).toThrow('tidak valid');
    expect(() => ringkasHasilUjian([{ ...result(), exam_id: null }])).toThrow('tidak valid');
  });
});
