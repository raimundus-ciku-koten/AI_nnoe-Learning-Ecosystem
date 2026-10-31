function csvCell(value) {
  const text = String(value ?? '');
  const safe = /^[\s]*[=+\-@\t\r]/.test(text) ? `'${text}` : text;
  return `"${safe.replace(/"/g, '""')}"`;
}

export function buatCsvSoalCanva(questions) {
  if (!Array.isArray(questions) || questions.length < 1 || questions.length > 100) {
    throw new TypeError('Ekspor harus berisi 1 sampai 100 soal.');
  }
  const header = [
    'Mata Pelajaran',
    'Kelas',
    'Bentuk Soal',
    'Pertanyaan',
    'Pilihan A',
    'Pilihan B',
    'Pilihan C',
    'Pilihan D',
    'Pilihan E',
    'Kunci Jawaban',
    'Pembahasan',
  ];
  const rows = questions.map((question) => {
    if (!question || typeof question !== 'object' ||
        typeof question.mapel !== 'string' ||
        typeof question.kelas !== 'string' ||
        !['pilihan_ganda', 'uraian'].includes(question.jenis) ||
        typeof question.pertanyaan !== 'string' ||
        !Array.isArray(question.pilihan) ||
        typeof question.jawaban !== 'string' ||
        typeof question.pembahasan !== 'string') {
      throw new TypeError('Format soal untuk ekspor Canva tidak valid.');
    }
    return [
      question.mapel,
      question.kelas,
      question.jenis === 'uraian' ? 'Uraian' : 'Pilihan ganda',
      question.pertanyaan,
      ...Array.from({ length: 5 }, (_, index) => question.pilihan[index] || ''),
      question.jawaban,
      question.pembahasan,
    ];
  });
  return `\uFEFF${[header, ...rows].map((row) => row.map(csvCell).join(',')).join('\r\n')}`;
}
