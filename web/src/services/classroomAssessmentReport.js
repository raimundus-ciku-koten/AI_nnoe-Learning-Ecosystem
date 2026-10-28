export function buatBarisAnalisisPenilaian(classroomReports) {
  if (!Array.isArray(classroomReports)) {
    throw new TypeError('Data analisis penilaian tidak valid.');
  }

  return classroomReports.flatMap(({ room, assignments, submissions, quizzes, quizResults }) => {
    if (!room || !Array.isArray(assignments) || !Array.isArray(submissions) ||
        !Array.isArray(quizzes) || !Array.isArray(quizResults)) {
      throw new TypeError('Data hasil penilaian kelas tidak lengkap.');
    }
    const assignmentById = new Map(assignments.map((item) => [item.id, item]));
    const quizById = new Map(quizzes.map((item) => [item.id, item]));

    const taskRows = submissions.flatMap((submission) => {
      const assignment = assignmentById.get(submission.assignmentId);
      if (!assignment) return [];
      return [{
        id: `tugas:${submission.id}`,
        classroomId: room.id,
        classroomName: room.nama,
        subject: room.mapel || '',
        studentId: submission.userId,
        studentName: submission.namaSiswa || 'Siswa',
        activityType: 'Tugas',
        activityName: assignment.judul,
        score: submission.nilai,
        submittedAt: submission.dikirim,
        feedback: submission.umpanBalik || '',
      }];
    });
    const quizRows = quizResults.flatMap((result) => {
      const quiz = quizById.get(result.quizId);
      if (!quiz) return [];
      return [{
        id: `kuis:${result.id}`,
        classroomId: room.id,
        classroomName: room.nama,
        subject: room.mapel || '',
        studentId: result.userId,
        studentName: result.namaSiswa || 'Siswa',
        activityType: 'Kuis',
        activityName: quiz.judul,
        score: result.nilai,
        submittedAt: result.dikirim,
        feedback: '',
      }];
    });
    return [...taskRows, ...quizRows];
  }).sort((left, right) => right.submittedAt.localeCompare(left.submittedAt));
}

export function ringkasAnalisisPenilaian(rows) {
  if (!Array.isArray(rows) || rows.some((row) => !row ||
      (row.score !== null && (!Number.isFinite(row.score) || row.score < 0 || row.score > 100)))) {
    throw new TypeError('Baris analisis penilaian tidak valid.');
  }
  const dinilai = rows.filter((row) => row.score !== null);
  return {
    jumlahPengumpulan: rows.length,
    jumlahDinilai: dinilai.length,
    jumlahMenunggu: rows.length - dinilai.length,
    rataRata: dinilai.length
      ? Math.round(dinilai.reduce((total, row) => total + row.score, 0) / dinilai.length)
      : null,
  };
}

export function ringkasPenilaianPerAktivitas(rows) {
  const grouped = new Map();
  for (const row of rows) {
    const key = `${row.classroomId}:${row.activityType}:${row.activityName}`;
    const group = grouped.get(key) || {
      classroomId: row.classroomId,
      classroomName: row.classroomName,
      activityType: row.activityType,
      activityName: row.activityName,
      jumlahPengumpulan: 0,
      jumlahDinilai: 0,
      totalNilai: 0,
    };
    group.jumlahPengumpulan += 1;
    if (row.score !== null) {
      group.jumlahDinilai += 1;
      group.totalNilai += row.score;
    }

    grouped.set(key, group);
  }
  return [...grouped.values()].map((group) => ({
    ...group,
    jumlahMenunggu: group.jumlahPengumpulan - group.jumlahDinilai,
    rataRata: group.jumlahDinilai
      ? Math.round(group.totalNilai / group.jumlahDinilai)
      : null,
  }));
}

export function klasifikasiTindakLanjut(rows, thresholds) {
  if (!Array.isArray(rows) || rows.some((row) => !row ||
      (row.score !== null &&
        (!Number.isFinite(row.score) || row.score < 0 || row.score > 100)))) {
    throw new TypeError('Baris peninjauan tindak lanjut tidak valid.');
  }
  if (!thresholds || !Number.isFinite(thresholds.remedial) ||
      !Number.isFinite(thresholds.enrichment) ||
      thresholds.remedial < 0 || thresholds.enrichment > 100 ||
      thresholds.remedial >= thresholds.enrichment) {
    throw new TypeError('Kriteria peninjauan tindak lanjut tidak valid.');
  }
  return rows
    .filter((row) => row.score !== null)
    .map((row) => ({
      ...row,
      followUp: row.score < thresholds.remedial
        ? 'Tinjau untuk remedial'
        : row.score >= thresholds.enrichment
          ? 'Tinjau untuk pengayaan'
          : 'Dalam rentang kriteria',
    }));
}
