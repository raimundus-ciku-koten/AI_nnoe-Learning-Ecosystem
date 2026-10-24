import { supabase } from '../lib/supabase.ts';

const PERAN_GURU = ['guru', 'guru_bk', 'guru_kokurikuler', 'guru_ekstrakurikuler'];
const SEMESTER = ['ganjil', 'genap'];
const PORTFOLIO_TEXT_FIELDS = [
  'kokurikuler_summary',
  'development_summary',
  'dimension_faith',
  'dimension_citizenship',
  'dimension_critical_reasoning',
  'dimension_creativity',
  'dimension_collaboration',
  'dimension_independence',
  'dimension_health',
  'dimension_communication',
  'extracurricular_summary',
  'achievements_summary',
  'homeroom_note',
];
const ATTENDANCE_FIELDS = [
  'attendance_present',
  'attendance_excused',
  'attendance_sick',
  'attendance_absent',
];
const KOLOM_RAPOR = [
  'id,tenant_id,classroom_id,student_id,academic_year,semester,student_name_snapshot,score,achievement_summary,status,created_by,updated_by,published_by,published_at,created_at,updated_at',
].join('');

function validasiKonteks(context, allowedRoles) {
  if (!context?.userId || !context?.tenantId ||
      !allowedRoles.includes(context.activeRole || context.role)) {
    throw new Error('Akun atau peran aktif tidak memiliki akses ke rapor.');
  }
}

function dariBarisRapor(row) {
  if (!row || typeof row.id !== 'string' ||
      typeof row.tenant_id !== 'string' ||
      typeof row.classroom_id !== 'string' ||
      typeof row.student_id !== 'string' ||
      typeof row.academic_year !== 'string' ||
      !SEMESTER.includes(row.semester) ||
      typeof row.student_name_snapshot !== 'string' ||
      !Number.isFinite(Number(row.score)) ||
      Number(row.score) < 0 || Number(row.score) > 100 ||
      typeof row.achievement_summary !== 'string' ||
      !['draft', 'published'].includes(row.status) ||
      typeof row.created_by !== 'string' ||
      (row.published_at !== null && (
        typeof row.published_at !== 'string' || !Number.isFinite(Date.parse(row.published_at))
      ))) {
    throw new Error('Supabase mengembalikan data rapor yang tidak valid.');
  }
  return {
    id: row.id,
    tenantId: row.tenant_id,
    classroomId: row.classroom_id,
    studentId: row.student_id,
    tahunAjaran: row.academic_year,
    semester: row.semester,
    namaSiswa: row.student_name_snapshot,
    nilai: Number(row.score),
    capaian: row.achievement_summary,
    status: row.status,
    dibuatOleh: row.created_by,
    diterbitkanOleh: row.published_by,
    diterbitkan: row.published_at,
  };
}

function dariBarisPortofolio(row) {
  if (!row || typeof row.id !== 'string' ||
      typeof row.tenant_id !== 'string' ||
      typeof row.student_id !== 'string' ||
      typeof row.academic_year !== 'string' ||
      !SEMESTER.includes(row.semester) ||
      typeof row.student_name_snapshot !== 'string' ||
      (row.student_nisn_snapshot !== null &&
        (typeof row.student_nisn_snapshot !== 'string' || !/^\d{1,20}$/.test(row.student_nisn_snapshot))) ||
      (row.student_gender_snapshot !== null && !['L', 'P'].includes(row.student_gender_snapshot)) ||
      !['', 'tk', 'sd', 'smp', 'sma'].includes(row.education_level_snapshot) ||
      !['draft', 'published'].includes(row.status) ||
      typeof row.created_by !== 'string' ||
      (row.published_at !== null && (
        typeof row.published_at !== 'string' || !Number.isFinite(Date.parse(row.published_at))
      ))) {
    throw new Error('Supabase mengembalikan portofolio rapor yang tidak valid.');
  }
  const attendance = {};
  for (const key of ATTENDANCE_FIELDS) {
    const value = row[key];
    if (value !== null && (!Number.isInteger(Number(value)) || Number(value) < 0 || Number(value) > 366)) {
      throw new Error('Supabase mengembalikan data presensi rapor yang tidak valid.');
    }
    attendance[key] = value === null ? null : Number(value);
  }
  for (const key of PORTFOLIO_TEXT_FIELDS) {
    if (typeof row[key] !== 'string') {
      throw new Error('Supabase mengembalikan bagian rapor dengan format tidak valid.');
    }
  }
  return {
    id: row.id,
    tenantId: row.tenant_id,
    studentId: row.student_id,
    tahunAjaran: row.academic_year,
    semester: row.semester,
    namaSiswa: row.student_name_snapshot,
    nisn: row.student_nisn_snapshot || '',
    jenisKelamin: row.student_gender_snapshot || '',
    jenjang: row.education_level_snapshot || '',
    presensi: attendance,
    kokurikuler: row.kokurikuler_summary,
    perkembanganAnak: row.development_summary,
    dimensiProfil: {
      faith: row.dimension_faith,
      citizenship: row.dimension_citizenship,
      criticalReasoning: row.dimension_critical_reasoning,
      creativity: row.dimension_creativity,
      collaboration: row.dimension_collaboration,
      independence: row.dimension_independence,
      health: row.dimension_health,
      communication: row.dimension_communication,
    },
    ekstrakurikuler: row.extracurricular_summary,
    prestasi: row.achievements_summary,
    catatanWaliKelas: row.homeroom_note,
    status: row.status,
    dibuatOleh: row.created_by,
    diterbitkanOleh: row.published_by,
    diterbitkan: row.published_at,
  };
}

export async function muatDaftarRapor(context, classroomId = null) {
  validasiKonteks(context, [...PERAN_GURU, 'admin_sekolah', 'siswa']);
  if (classroomId !== null && (typeof classroomId !== 'string' || !classroomId.trim())) {
    throw new TypeError('Kelas rapor tidak valid.');
  }
  let query = supabase
    .from('learning_classroom_report_cards')
    .select(KOLOM_RAPOR)
    .eq('tenant_id', context.tenantId)
    .order('student_name_snapshot')
    .limit(1000);
  if (classroomId) query = query.eq('classroom_id', classroomId);
  const { data, error } = await query;
  if (error) throw error;
  if (!Array.isArray(data)) throw new Error('Supabase tidak mengembalikan daftar rapor.');
  return data.map(dariBarisRapor);
}

export async function muatPortofolioRapor(context) {
  validasiKonteks(context, [...PERAN_GURU, 'admin_sekolah', 'siswa']);
  const fields = [
    'id', 'tenant_id', 'student_id', 'academic_year', 'semester', 'student_name_snapshot',
    'student_nisn_snapshot', 'student_gender_snapshot',
    'education_level_snapshot',
    ...ATTENDANCE_FIELDS, ...PORTFOLIO_TEXT_FIELDS,
    'status', 'created_by', 'published_by', 'published_at',
  ].join(',');
  const { data, error } = await supabase
    .from('learning_school_report_card_portfolios')
    .select(fields)
    .eq('tenant_id', context.tenantId)
    .order('student_name_snapshot')
    .limit(1000);
  if (error) throw error;
  if (!Array.isArray(data)) throw new Error('Supabase tidak mengembalikan portofolio rapor.');
  return data.map(dariBarisPortofolio);
}

export async function simpanPortofolioRapor(context, classroomId, studentId, portfolio) {
  validasiKonteks(context, PERAN_GURU);
  if (typeof classroomId !== 'string' || !classroomId.trim() ||
      typeof studentId !== 'string' || !studentId.trim() ||
      !portfolio || typeof portfolio !== 'object') {
    throw new TypeError('Data portofolio rapor tidak valid.');
  }
  const normalizeText = (key, maximum) => {
    const value = portfolio[key] ?? '';
    if (typeof value !== 'string' || value.length > maximum ||
        /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/.test(value)) {
      throw new TypeError('Data portofolio rapor tidak valid.');
    }
    return value.trim();
  };
  const normalizeAttendance = (key) => {
    const value = portfolio.presensi?.[key];
    if (value === '' || value === null || value === undefined) return null;
    const numeric = Number(value);
    if (!Number.isInteger(numeric) || numeric < 0 || numeric > 366) {
      throw new TypeError('Jumlah kehadiran harus bilangan bulat 0–366 atau dikosongkan.');
    }
    return numeric;
  };
  const dimensi = portfolio.dimensiProfil || {};
  const { data, error } = await supabase.rpc('save_learning_school_report_card_portfolio', {
    p_classroom_id: classroomId,
    p_student_id: studentId,
    p_attendance_present: normalizeAttendance('attendance_present'),
    p_attendance_excused: normalizeAttendance('attendance_excused'),
    p_attendance_sick: normalizeAttendance('attendance_sick'),
    p_attendance_absent: normalizeAttendance('attendance_absent'),
    p_kokurikuler_summary: normalizeText('kokurikuler', 5000),
    p_development_summary: normalizeText('perkembanganAnak', 5000),
    p_dimension_faith: validateDimension(dimensi.faith),
    p_dimension_citizenship: validateDimension(dimensi.citizenship),
    p_dimension_critical_reasoning: validateDimension(dimensi.criticalReasoning),
    p_dimension_creativity: validateDimension(dimensi.creativity),
    p_dimension_collaboration: validateDimension(dimensi.collaboration),
    p_dimension_independence: validateDimension(dimensi.independence),
    p_dimension_health: validateDimension(dimensi.health),
    p_dimension_communication: validateDimension(dimensi.communication),
    p_extracurricular_summary: normalizeText('ekstrakurikuler', 3000),
    p_achievements_summary: normalizeText('prestasi', 3000),
    p_homeroom_note: normalizeText('catatanWaliKelas', 3000),
  });
  if (error) throw error;
  if (typeof data !== 'string' || !data) {
    throw new Error('Supabase tidak mengonfirmasi penyimpanan portofolio rapor.');
  }
  return data;
}

function validateDimension(value) {
  const text = value ?? '';
  if (typeof text !== 'string' || text.length > 1000 ||
      /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/.test(text)) {
    throw new TypeError('Deskripsi dimensi profil lulusan tidak valid.');
  }
  return text.trim();
}

export async function terbitkanPortofolioRapor(context, portfolioId) {
  validasiKonteks(context, ['admin_sekolah']);
  if (typeof portfolioId !== 'string' || !portfolioId.trim()) {
    throw new TypeError('Portofolio rapor yang akan diterbitkan tidak valid.');
  }
  const { data, error } = await supabase.rpc('publish_learning_school_report_card_portfolio', {
    p_portfolio_id: portfolioId,
  });
  if (error) throw error;
  if (typeof data !== 'string' || data !== portfolioId) {
    throw new Error('Supabase tidak mengonfirmasi penerbitan portofolio rapor.');
  }
  return data;
}

export async function bukaKembaliPortofolioRapor(context, portfolioId, reason) {
  validasiKonteks(context, ['admin_sekolah']);
  if (typeof portfolioId !== 'string' || !portfolioId.trim() ||
      typeof reason !== 'string' || reason.trim().length < 10 || reason.trim().length > 500 ||
      /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/.test(reason)) {
    throw new TypeError('Portofolio rapor atau alasan pembukaan kembali tidak valid.');
  }
  const { data, error } = await supabase.rpc('reopen_learning_school_report_card_portfolio', {
    p_portfolio_id: portfolioId,
    p_reason: reason.trim(),
  });
  if (error) throw error;
  if (typeof data !== 'string' || data !== portfolioId) {
    throw new Error('Supabase tidak mengonfirmasi pembukaan kembali portofolio rapor.');
  }
  return data;
}

export async function simpanDrafRapor(context, classroomId, studentId, score, achievement) {
  validasiKonteks(context, PERAN_GURU);
  if (typeof score !== 'number' && (typeof score !== 'string' || !score.trim())) {
    throw new TypeError('Nilai atau deskripsi capaian tidak valid.');
  }
  const numericScore = Number(score);
  if (!classroomId || !studentId || !Number.isFinite(numericScore) ||
      numericScore < 0 || numericScore > 100 ||
      typeof achievement !== 'string' || achievement.trim().length > 3000 ||
      /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/.test(achievement)) {
    throw new TypeError('Nilai atau deskripsi capaian tidak valid.');
  }
  const { data, error } = await supabase.rpc('save_learning_classroom_report_card_draft', {
    p_classroom_id: classroomId,
    p_student_id: studentId,
    p_score: numericScore,
    p_achievement_summary: achievement.trim(),
  });
  if (error) throw error;
  if (typeof data !== 'string' || !data) {
    throw new Error('Supabase tidak mengonfirmasi penyimpanan draf rapor.');
  }
  return data;
}

export async function terbitkanRapor(context, reportCardId) {
  validasiKonteks(context, ['admin_sekolah']);
  if (typeof reportCardId !== 'string' || !reportCardId.trim()) {
    throw new TypeError('Rapor yang akan diterbitkan tidak valid.');
  }
  const { data, error } = await supabase.rpc('publish_learning_classroom_report_card', {
    p_report_card_id: reportCardId,
  });
  if (error) throw error;
  if (typeof data !== 'string' || data !== reportCardId) {
    throw new Error('Supabase tidak mengonfirmasi penerbitan rapor.');
  }
  return data;
}

export async function bukaKembaliRapor(context, reportCardId, reason) {
  validasiKonteks(context, ['admin_sekolah']);
  if (typeof reportCardId !== 'string' || !reportCardId.trim() ||
      typeof reason !== 'string' || reason.trim().length < 10 || reason.trim().length > 500) {
    throw new TypeError('Rapor atau alasan pembukaan kembali tidak valid.');
  }
  const { data, error } = await supabase.rpc('reopen_learning_classroom_report_card', {
    p_report_card_id: reportCardId,
    p_reason: reason.trim(),
  });
  if (error) throw error;
  if (typeof data !== 'string' || data !== reportCardId) {
    throw new Error('Supabase tidak mengonfirmasi pembukaan kembali rapor.');
  }
  return data;
}
