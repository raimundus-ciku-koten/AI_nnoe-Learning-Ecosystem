import { describe, expect, it } from 'vitest';
import {
  jadwalBerikutnyaUjian,
  pesanKesalahanSinkronisasiUjian,
  statusKetersediaanUjian,
  statusTampilanUjian,
  tandaiUjianTerkumpul,
  ujianBelumDimulai,
} from './OnlineAssessmentPage.jsx';

describe('student online exam availability', () => {
  const exam = {
    starts_at: '2026-10-23T08:00:00.000Z',
    attempt_status: 'not_started',
  };
  const beforeStart = Date.parse('2026-10-23T07:59:59.000Z');
  const atStart = Date.parse(exam.starts_at);

  it('keeps a not-yet-started exam unavailable until its scheduled start', () => {
    expect(ujianBelumDimulai(exam, beforeStart)).toBe(true);
    expect(ujianBelumDimulai(exam, atStart)).toBe(false);
  });

  it('allows resuming an in-progress attempt even when its original start time is future', () => {
    expect(ujianBelumDimulai({ ...exam, attempt_status: 'in_progress' }, beforeStart))
      .toBe(false);
  });

  it('prevents starting before the schedule or after it ends', () => {
    const scheduledExam = {
      ...exam,
      ends_at: '2026-10-23T09:00:00.000Z',
    };
    expect(statusKetersediaanUjian(scheduledExam, beforeStart)).toBe('upcoming');
    expect(statusKetersediaanUjian(scheduledExam, atStart)).toBe('available');
    expect(statusKetersediaanUjian(
      scheduledExam,
      Date.parse(scheduledExam.ends_at),
    )).toBe('expired');
  });

  it('keeps an existing attempt available independently of the schedule window', () => {
    const scheduledExam = {
      ...exam,
      ends_at: '2026-10-23T09:00:00.000Z',
      attempt_status: 'in_progress',
    };
    expect(statusKetersediaanUjian(scheduledExam, beforeStart)).toBe('available');
    expect(statusKetersediaanUjian(
      scheduledExam,
      Date.parse(scheduledExam.ends_at),
    )).toBe('available');
  });

  it('schedules the next start or end boundary only for unstarted exams', () => {
    const upcoming = {
      ...exam,
      ends_at: '2026-10-23T09:00:00.000Z',
    };
    const inProgress = {
      ...upcoming,
      attempt_status: 'in_progress',
      starts_at: '2026-10-23T08:30:00.000Z',
      ends_at: '2026-10-23T08:45:00.000Z',
    };
    expect(jadwalBerikutnyaUjian([upcoming, inProgress], beforeStart))
      .toBe(atStart);
    expect(jadwalBerikutnyaUjian([upcoming], atStart))
      .toBe(Date.parse(upcoming.ends_at));
    expect(jadwalBerikutnyaUjian([inProgress], beforeStart)).toBeUndefined();
  });

  it('preserves local draft and server list errors independently', () => {
    expect(pesanKesalahanSinkronisasiUjian({
      draftError: 'storage penuh',
      loadError: '',
    })).toBe('Draft lokal tidak dapat dibaca: storage penuh');
    expect(pesanKesalahanSinkronisasiUjian({
      draftError: 'storage penuh',
      loadError: 'koneksi gagal',
    })).toBe('Draft lokal tidak dapat dibaca: storage penuh Daftar ujian belum dapat disinkronkan: koneksi gagal');
    expect(pesanKesalahanSinkronisasiUjian({ draftError: '', loadError: '' })).toBe('');
  });

  it('uses the server submission status over a stale local pending draft', () => {
    expect(statusTampilanUjian(
      { attempt_status: 'submitted' },
      { submissionId: 'pending-local-id' },
    )).toEqual({ label: 'Sudah dikumpulkan', canResume: false });
    expect(statusTampilanUjian(
      { attempt_status: 'in_progress' },
      { submissionId: 'pending-local-id' },
    )).toEqual({
      label: 'Pengumpulan menunggu konfirmasi server',
      canResume: true,
    });
  });

  it('marks only the successfully submitted exam complete in the current list', () => {
    const exams = [
      { exam_id: 'exam-1', attempt_status: 'in_progress' },
      { exam_id: 'exam-2', attempt_status: 'not_started' },
    ];
    expect(tandaiUjianTerkumpul(exams, 'exam-1')).toEqual([
      { exam_id: 'exam-1', attempt_status: 'submitted' },
      { exam_id: 'exam-2', attempt_status: 'not_started' },
    ]);
    expect(tandaiUjianTerkumpul(exams, 'missing')).toEqual(exams);
  });
});
