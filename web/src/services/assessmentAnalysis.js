function numeric(value) {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'string' && value.trim() && Number.isFinite(Number(value))) {
    return Number(value);
  }
  return null;
}

export function ringkasHasilUjian(results) {
  if (!Array.isArray(results)) throw new TypeError('Daftar hasil ujian tidak valid.');
  const exams = new Map();

  for (const result of results) {
    if (!result || typeof result.exam_id !== 'string' || typeof result.title !== 'string' ||
        typeof result.kelas !== 'string' || typeof result.attempt_id !== 'string' ||
        typeof result.grade_pending !== 'boolean') {
      throw new TypeError('Data hasil ujian untuk analisis tidak valid.');
    }

    let exam = exams.get(result.exam_id);
    if (!exam) {
      exam = {
        examId: result.exam_id,
        title: result.title,
        className: result.kelas,
        submissions: 0,
        gradedSubmissions: 0,
        pendingReview: 0,
        scoreTotal: 0,
        objectiveCorrect: 0,
        objectiveTotal: 0,
      };
      exams.set(result.exam_id, exam);
    }

    exam.submissions += 1;
    if (result.grade_pending) {
      exam.pendingReview += 1;
    } else {
      const score = numeric(result.score);
      if (score !== null) {
        exam.gradedSubmissions += 1;
        exam.scoreTotal += score;
      }
    }

    const correct = numeric(result.objective_correct);
    const total = numeric(result.objective_total);
    if (correct !== null && total !== null && total > 0 && correct >= 0 && correct <= total) {
      exam.objectiveCorrect += correct;
      exam.objectiveTotal += total;
    }
  }

  return [...exams.values()].map((exam) => ({
    examId: exam.examId,
    title: exam.title,
    className: exam.className,
    submissions: exam.submissions,
    gradedSubmissions: exam.gradedSubmissions,
    pendingReview: exam.pendingReview,
    averageScore: exam.gradedSubmissions
      ? Math.round((exam.scoreTotal / exam.gradedSubmissions) * 10) / 10
      : null,
    objectiveCorrect: exam.objectiveCorrect,
    objectiveTotal: exam.objectiveTotal,
    objectiveAccuracy: exam.objectiveTotal
      ? Math.round((exam.objectiveCorrect / exam.objectiveTotal) * 1000) / 10
      : null,
  }));
}
