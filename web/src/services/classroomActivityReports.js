const STATUS_PRESENSI = ['hadir', 'izin', 'sakit', 'alpa'];

export function buatBarisLaporanAktivitas({ room, journals, sessions, attendance, roster }) {
  if (!room || typeof room.id !== 'string' ||
      !Array.isArray(journals) || !Array.isArray(sessions) ||
      !Array.isArray(attendance) || !Array.isArray(roster)) {
    throw new TypeError('Data laporan aktivitas kelas tidak valid.');
  }
  const hari = new Map();
  const dapatkanHari = (date) => {
    const key = `${room.id}:${date}`;
    if (!hari.has(key)) {
      hari.set(key, {
        id: key,
        classroomId: room.id,
        classroomName: room.nama,
        subject: room.mapel || '',
        tanggal: date,
        jurnal: [],
        presensi: null,
      });
    }
    return hari.get(key);
  };

  for (const journal of journals) {
    if (!journal || typeof journal.lessonDate !== 'string' ||
        !/^\d{4}-\d{2}-\d{2}$/.test(journal.lessonDate) ||
        typeof journal.topic !== 'string') {
      throw new TypeError('Catatan jurnal untuk laporan tidak valid.');
    }
    dapatkanHari(journal.lessonDate).jurnal.push({
      id: journal.id,
      topik: journal.topic,
    });
  }

  for (const session of sessions) {
    if (!session || typeof session.id !== 'string' ||
        typeof session.tanggal !== 'string' ||
        !/^\d{4}-\d{2}-\d{2}$/.test(session.tanggal)) {
      throw new TypeError('Sesi presensi untuk laporan tidak valid.');
    }
    const records = attendance.filter((record) => record.sessionId === session.id);
    if (records.some((record) => !STATUS_PRESENSI.includes(record.status))) {
      throw new TypeError('Status presensi untuk laporan tidak valid.');
    }
    const counts = Object.fromEntries(STATUS_PRESENSI.map((status) => [
      status,
      records.filter((record) => record.status === status).length,
    ]));
    dapatkanHari(session.tanggal).presensi = {
      sessionId: session.id,
      judul: session.judul,
      jumlahSiswa: roster.length,
      jumlahTercatat: records.length,
      ...counts,
    };
  }

  return [...hari.values()].sort((left, right) =>
    right.tanggal.localeCompare(left.tanggal) ||
    left.classroomName.localeCompare(right.classroomName, 'id'));
}

export function filterRentangLaporan(rows, from, to) {
  if (!Array.isArray(rows) || !/^\d{4}-\d{2}-\d{2}$/.test(from) ||
      !/^\d{4}-\d{2}-\d{2}$/.test(to) || from > to) {
    throw new TypeError('Rentang tanggal laporan tidak valid.');
  }
  return rows.filter((row) => row.tanggal >= from && row.tanggal <= to);
}

export function kelompokkanLaporanBulanan(rows) {
  if (!Array.isArray(rows)) throw new TypeError('Baris laporan tidak valid.');
  const months = new Map();
  for (const row of rows) {
    const month = row.tanggal.slice(0, 7);
    const key = `${row.classroomId}:${month}`;
    const group = months.get(key) || {
      id: key,
      classroomId: row.classroomId,
      classroomName: row.classroomName,
      subject: row.subject,
      bulan: month,
      jumlahHari: 0,
      jumlahJurnal: 0,
      topik: [],
      jumlahSesiPresensi: 0,
      jumlahSiswaTerdaftar: 0,
      jumlahTercatat: 0,
      hadir: 0,
      izin: 0,
      sakit: 0,
      alpa: 0,
    };
    group.jumlahHari += 1;
    group.jumlahJurnal += row.jurnal.length;
    group.topik.push(...row.jurnal.map((journal) => journal.topik));
    if (row.presensi) {
      group.jumlahSesiPresensi += 1;
      group.jumlahSiswaTerdaftar += row.presensi.jumlahSiswa;
      group.jumlahTercatat += row.presensi.jumlahTercatat;
      for (const status of STATUS_PRESENSI) group[status] += row.presensi[status];
    }
    months.set(key, group);
  }
  return [...months.values()]
    .map((group) => ({ ...group, topik: [...new Set(group.topik)] }))
    .sort((left, right) =>
      right.bulan.localeCompare(left.bulan) ||
      left.classroomName.localeCompare(right.classroomName, 'id'));
}
