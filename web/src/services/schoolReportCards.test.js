import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => {
  const response = {
    rows: [],
    rpcResult: { data: 'report-1', error: null },
  };
  const query = {};
  for (const method of ['select', 'eq', 'order', 'limit']) {
    query[method] = vi.fn(() => query);
  }
  query.then = (resolve, reject) => Promise.resolve({
    data: response.rows,
    error: null,
  }).then(resolve, reject);
  return {
    response,
    query,
    from: vi.fn(() => query),
    rpc: vi.fn(() => Promise.resolve(response.rpcResult)),
  };
});

vi.mock('../lib/supabase.ts', () => ({
  supabase: { from: mocks.from, rpc: mocks.rpc },
}));

import {
  bukaKembaliPortofolioRapor,
  bukaKembaliRapor,
  muatDaftarRapor,
  muatPortofolioRapor,
  simpanPortofolioRapor,
  simpanDrafRapor,
  terbitkanPortofolioRapor,
  terbitkanRapor,
} from './schoolReportCards.js';

const teacher = { userId: 'teacher-1', activeRole: 'guru', tenantId: 'school-1' };
const admin = { userId: 'admin-1', activeRole: 'admin_sekolah', tenantId: 'school-1' };
const reportRow = {
  id: 'report-1',
  tenant_id: 'school-1',
  classroom_id: 'class-1',
  student_id: 'student-1',
  academic_year: '2026/2027',
  semester: 'ganjil',
  student_name_snapshot: 'Siswa Satu',
  score: '87.5',
  achievement_summary: 'Memahami konsep.',
  status: 'draft',
  created_by: 'teacher-1',
  updated_by: 'teacher-1',
  published_by: null,
  published_at: null,
};
const portfolioRow = {
  id: 'portfolio-1',
  tenant_id: 'school-1',
  student_id: 'student-1',
  academic_year: '2026/2027',
  semester: 'ganjil',
  student_name_snapshot: 'Siswa Satu',
  student_nisn_snapshot: '1234567890',
  student_gender_snapshot: 'P',
  education_level_snapshot: 'tk',
  attendance_present: 80,
  attendance_excused: null,
  attendance_sick: 2,
  attendance_absent: null,
  kokurikuler_summary: 'Proyek kebun sekolah.',
  development_summary: 'Mulai berani menceritakan hasil pengamatan.',
  dimension_faith: '',
  dimension_citizenship: '',
  dimension_critical_reasoning: 'Menyusun argumen berbasis data.',
  dimension_creativity: '',
  dimension_collaboration: 'Bekerja sama.',
  dimension_independence: '',
  dimension_health: '',
  dimension_communication: '',
  extracurricular_summary: '',
  achievements_summary: '',
  homeroom_note: '',
  status: 'draft',
  created_by: 'teacher-1',
  published_by: null,
  published_at: null,
};
const portfolio = {
  presensi: {
    attendance_present: 80,
    attendance_excused: null,
    attendance_sick: 2,
    attendance_absent: null,
  },
  kokurikuler: 'Proyek kebun sekolah.',
  perkembanganAnak: 'Mulai berani menceritakan hasil pengamatan.',
  dimensiProfil: {
    criticalReasoning: 'Menyusun argumen berbasis data.',
    collaboration: 'Bekerja sama.',
  },
  ekstrakurikuler: '',
  prestasi: '',
  catatanWaliKelas: '',
};

describe('schoolReportCards', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.response.rows = [reportRow];
    mocks.response.rpcResult = { data: 'report-1', error: null };
  });

  it('loads the report rows within the authenticated tenant scope', async () => {
    await expect(muatDaftarRapor(teacher, 'class-1')).resolves.toMatchObject([{
      id: 'report-1',
      tenantId: 'school-1',
      classroomId: 'class-1',
      nilai: 87.5,
      status: 'draft',
    }]);
    expect(mocks.from).toHaveBeenCalledWith('learning_classroom_report_cards');
    expect(mocks.query.eq).toHaveBeenCalledWith('tenant_id', 'school-1');
    expect(mocks.query.eq).toHaveBeenCalledWith('classroom_id', 'class-1');
  });

  it('saves a draft through the protected RPC after validating the score', async () => {
    await expect(simpanDrafRapor(teacher, 'class-1', 'student-1', '88.5', 'Baik'))
      .resolves.toBe('report-1');
    expect(mocks.rpc).toHaveBeenCalledWith('save_learning_classroom_report_card_draft', {
      p_classroom_id: 'class-1',
      p_student_id: 'student-1',
      p_score: 88.5,
      p_achievement_summary: 'Baik',
    });
    await expect(simpanDrafRapor(teacher, 'class-1', 'student-1', '', ''))
      .rejects.toThrow('Nilai atau deskripsi capaian tidak valid');
    await expect(simpanDrafRapor({ ...teacher, activeRole: 'siswa' }, 'class-1', 'student-1', 80, ''))
      .rejects.toThrow('Akun atau peran aktif');
  });

  it('restricts publish and reopen actions to the active school administrator', async () => {
    await expect(terbitkanRapor(admin, 'report-1')).resolves.toBe('report-1');
    expect(mocks.rpc).toHaveBeenCalledWith('publish_learning_classroom_report_card', {
      p_report_card_id: 'report-1',
    });
    await expect(bukaKembaliRapor(admin, 'report-1', 'Koreksi data nilai'))
      .resolves.toBe('report-1');
    expect(mocks.rpc).toHaveBeenLastCalledWith('reopen_learning_classroom_report_card', {
      p_report_card_id: 'report-1',
      p_reason: 'Koreksi data nilai',
    });
    await expect(terbitkanRapor(teacher, 'report-1'))
      .rejects.toThrow('Akun atau peran aktif');
    await expect(bukaKembaliRapor(admin, 'report-1', 'singkat'))
      .rejects.toThrow('Rapor atau alasan pembukaan kembali tidak valid');
  });

  it('loads and validates the student portfolio, including optional attendance counts', async () => {
    mocks.response.rows = [portfolioRow];
    await expect(muatPortofolioRapor(teacher)).resolves.toMatchObject([{
      id: 'portfolio-1',
      studentId: 'student-1',
      nisn: '1234567890',
      jenisKelamin: 'P',
      kokurikuler: 'Proyek kebun sekolah.',
      perkembanganAnak: 'Mulai berani menceritakan hasil pengamatan.',
      presensi: { attendance_present: 80, attendance_excused: null },
      dimensiProfil: { criticalReasoning: 'Menyusun argumen berbasis data.' },
    }]);
    expect(mocks.from).toHaveBeenCalledWith('learning_school_report_card_portfolios');
    mocks.response.rows = [{ ...portfolioRow, dimension_faith: null }];
    await expect(muatPortofolioRapor(teacher))
      .rejects.toThrow('bagian rapor dengan format tidak valid');
    mocks.response.rows = [{ ...portfolioRow, education_level_snapshot: 'smk' }];
    await expect(muatPortofolioRapor(teacher))
      .rejects.toThrow('portofolio rapor yang tidak valid');
  });

  it('saves a validated portfolio through the role-protected RPC', async () => {
    await expect(simpanPortofolioRapor(
      teacher,
      'class-1',
      'student-1',
      portfolio,
    )).resolves.toBe('report-1');
    expect(mocks.rpc).toHaveBeenCalledWith('save_learning_school_report_card_portfolio', expect.objectContaining({
      p_classroom_id: 'class-1',
      p_student_id: 'student-1',
      p_attendance_present: 80,
      p_attendance_excused: null,
      p_kokurikuler_summary: 'Proyek kebun sekolah.',
      p_development_summary: 'Mulai berani menceritakan hasil pengamatan.',
      p_dimension_critical_reasoning: 'Menyusun argumen berbasis data.',
    }));
    await expect(simpanPortofolioRapor(teacher, 'class-1', 'student-1', {
      ...portfolio,
      presensi: { attendance_present: 367 },
    })).rejects.toThrow('Jumlah kehadiran');
    await expect(simpanPortofolioRapor(teacher, 'class-1', 'student-1', {
      ...portfolio,
      kokurikuler: 'x'.repeat(5001),
    })).rejects.toThrow('Data portofolio rapor tidak valid');
  });

  it('restricts portfolio publication and reopening to school administrators', async () => {
    mocks.response.rpcResult = { data: 'portfolio-1', error: null };
    await expect(terbitkanPortofolioRapor(admin, 'portfolio-1')).resolves.toBe('portfolio-1');
    expect(mocks.rpc).toHaveBeenCalledWith('publish_learning_school_report_card_portfolio', {
      p_portfolio_id: 'portfolio-1',
    });
    await expect(bukaKembaliPortofolioRapor(admin, 'portfolio-1', 'Koreksi catatan wali kelas'))
      .resolves.toBe('portfolio-1');
    expect(mocks.rpc).toHaveBeenLastCalledWith('reopen_learning_school_report_card_portfolio', {
      p_portfolio_id: 'portfolio-1',
      p_reason: 'Koreksi catatan wali kelas',
    });
    await expect(terbitkanPortofolioRapor(teacher, 'portfolio-1'))
      .rejects.toThrow('Akun atau peran aktif');
    await expect(bukaKembaliPortofolioRapor(admin, 'portfolio-1', 'singkat'))
      .rejects.toThrow('alasan pembukaan kembali tidak valid');
  });
});
