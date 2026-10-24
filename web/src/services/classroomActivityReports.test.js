import { describe, expect, it } from 'vitest';
import {
  buatBarisLaporanAktivitas,
  filterRentangLaporan,
  kelompokkanLaporanBulanan,
} from './classroomActivityReports.js';

const data = {
  room: { id: 'class-1', nama: 'X-A', mapel: 'Matematika' },
  journals: [
    { id: 'journal-1', lessonDate: '2026-10-01', topic: 'Pecahan' },
    { id: 'journal-2', lessonDate: '2026-10-01', topic: 'Latihan' },
  ],
  sessions: [
    { id: 'session-1', tanggal: '2026-10-01', judul: 'Presensi pagi' },
    { id: 'session-2', tanggal: '2026-10-04', judul: 'Praktik' },
  ],
  attendance: [
    { sessionId: 'session-1', studentId: 'student-1', status: 'hadir' },
    { sessionId: 'session-1', studentId: 'student-2', status: 'izin' },
    { sessionId: 'session-2', studentId: 'student-1', status: 'hadir' },
  ],
  roster: [{ id: 'student-1' }, { id: 'student-2' }, { id: 'student-3' }],
};

describe('classroomActivityReports', () => {
  it('combines stored journals and attendance sessions without creating empty days', () => {
    const rows = buatBarisLaporanAktivitas(data);
    expect(rows).toHaveLength(2);
    expect(rows[0]).toMatchObject({
      tanggal: '2026-10-04',
      presensi: { jumlahSiswa: 3, jumlahTercatat: 1, hadir: 1, izin: 0 },
      jurnal: [],
    });
    expect(rows[1]).toMatchObject({
      tanggal: '2026-10-01',
      jurnal: [{ topik: 'Pecahan' }, { topik: 'Latihan' }],
      presensi: { jumlahTercatat: 2, hadir: 1, izin: 1 },
    });
  });

  it('filters the requested inclusive date range and validates it', () => {
    const rows = buatBarisLaporanAktivitas(data);
    expect(filterRentangLaporan(rows, '2026-10-02', '2026-10-04'))
      .toHaveLength(1);
    expect(() => filterRentangLaporan(rows, '2026-10-05', '2026-10-01'))
      .toThrow('Rentang tanggal laporan tidak valid');
  });

  it('aggregates monthly totals per class from stored records only', () => {
    const monthly = kelompokkanLaporanBulanan(buatBarisLaporanAktivitas(data));
    expect(monthly).toHaveLength(1);
    expect(monthly[0]).toMatchObject({
      bulan: '2026-10',
      jumlahHari: 2,
      jumlahJurnal: 2,
      jumlahSesiPresensi: 2,
      jumlahSiswaTerdaftar: 6,
      jumlahTercatat: 3,
      hadir: 2,
      izin: 1,
    });
    expect(monthly[0].topik).toEqual(['Pecahan', 'Latihan']);
  });
});
