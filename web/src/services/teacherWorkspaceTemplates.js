const TEMPLATES = {
  pelaksanaan: ['Tujuan atau fokus pembelajaran', 'Kegiatan yang dilaksanakan', 'Bukti keterlaksanaan', 'Refleksi singkat', 'Tindak lanjut'],
  asesmen: ['Tujuan dan kriteria asesmen', 'Instrumen atau sumber bukti', 'Ringkasan temuan tanpa identitas siswa', 'Hal yang perlu ditindaklanjuti', 'Rencana tindak lanjut'],
  pemantauan: ['Konteks umum', 'Pengamatan yang relevan tanpa identitas pribadi', 'Dukungan yang sudah atau perlu diberikan', 'Koordinasi yang diperlukan', 'Tindak lanjut dan waktu tinjau'],
  refleksi: ['Praktik atau situasi yang direfleksikan', 'Hal yang berjalan baik', 'Tantangan dan kemungkinan penyebab', 'Pembelajaran profesional', 'Perubahan atau tindak lanjut'],
  laporan: ['Periode dan cakupan catatan', 'Ringkasan kegiatan atau capaian', 'Sumber informasi yang digunakan', 'Hal yang belum terselesaikan', 'Tindak lanjut'],
  kolaborasi: ['Tujuan koordinasi', 'Pokok pembahasan', 'Kesepakatan atau keputusan', 'Penanggung jawab tindak lanjut', 'Waktu tinjau kembali'],
  pengaturan: ['Tujuan atau kebutuhan', 'Preferensi atau perubahan yang diperlukan', 'Dampak yang perlu diperhatikan', 'Tindak lanjut melalui pengaturan resmi'],
};

const TEMPLATES_BY_PATH = {
  '/pelaksanaan/jurnal': ['Tujuan pembelajaran', 'Kegiatan pembuka, inti, dan penutup', 'Materi atau sumber belajar', 'Respons umum kelas tanpa identitas siswa', 'Refleksi dan rencana pertemuan berikutnya'],
  '/pelaksanaan/realisasi': ['Rencana pembelajaran yang dirujuk', 'Kegiatan yang terlaksana', 'Bagian yang berubah dan alasannya', 'Bukti keterlaksanaan', 'Tindak lanjut'],
  '/pelaksanaan/catatan-cepat': ['Konteks dan tanggal', 'Catatan inti', 'Hal yang perlu segera ditindaklanjuti'],
  '/asesmen/diagnostik': ['Tujuan pemetaan awal', 'Aspek atau prasyarat yang diamati', 'Ringkasan kebutuhan belajar tanpa identitas siswa', 'Strategi pengelompokan atau dukungan', 'Waktu peninjauan kembali'],
  '/asesmen/formatif': ['Tujuan pembelajaran yang dipantau', 'Teknik cek pemahaman', 'Ringkasan bukti belajar tanpa identitas siswa', 'Umpan balik atau penyesuaian pembelajaran', 'Tindak lanjut pertemuan berikutnya'],
  '/asesmen/sumatif': ['Tujuan dan cakupan asesmen', 'Instrumen dan kriteria', 'Ringkasan hasil agregat tanpa identitas siswa', 'Keterbatasan atau catatan validitas', 'Rencana tindak lanjut'],
  '/asesmen/remedial': ['Kompetensi yang perlu diperkuat', 'Strategi remedial atau pengayaan', 'Sumber dan jadwal kegiatan', 'Bukti perkembangan tanpa identitas siswa', 'Kriteria evaluasi dan tindak lanjut'],
  '/pemantauan/profil-siswa': ['Konteks pembelajaran yang relevan', 'Kekuatan atau minat yang teramati', 'Kebutuhan dukungan tanpa data sensitif', 'Strategi pendampingan', 'Waktu dan cara meninjau perkembangan'],
  '/pemantauan/pendampingan': ['Tujuan pendampingan', 'Dukungan yang disepakati', 'Pihak atau peran yang perlu berkoordinasi', 'Langkah berikut dan penanggung jawab', 'Waktu tinjau ulang'],
  '/refleksi/pembelajaran': ['Fokus refleksi', 'Praktik yang efektif dan buktinya', 'Tantangan yang muncul', 'Alternatif strategi', 'Komitmen perbaikan berikutnya'],
  '/refleksi/kompetensi': ['Kompetensi yang ingin dikembangkan', 'Kondisi atau praktik saat ini', 'Sumber belajar atau dukungan', 'Langkah pengembangan terukur', 'Target waktu dan evaluasi'],
  '/kolaborasi/praktik-baik': ['Konteks praktik', 'Strategi yang dicoba', 'Bukti manfaat dan batasan', 'Hal yang dapat diadaptasi rekan', 'Rencana berbagi atau evaluasi'],
  '/kolaborasi/guru-pengganti': ['Kelas, tanggal, dan jadwal', 'Tujuan serta instruksi pembelajaran', 'Bahan atau akses yang diperlukan', 'Informasi kelas yang relevan tanpa data pribadi', 'Kontak dan tindak lanjut'],
  '/laporan/kinerja-guru': ['Periode laporan', 'Kegiatan pembelajaran dan tanggung jawab', 'Capaian atau bukti kerja', 'Kendala dan tindak lanjut', 'Rencana pengembangan berikutnya'],
};

export function buatKerangkaCatatan(grupId, label, path) {
  const headings = TEMPLATES_BY_PATH[path] || TEMPLATES[grupId] || [
    'Tujuan atau konteks',
    'Ringkasan informasi',
    'Hal yang perlu diperhatikan',
    'Tindak lanjut',
  ];
  const normalizedLabel = String(label || '').trim() || 'Catatan kerja';
  const outline = headings.map((heading) => `${heading}:\n`).join('\n');
  return {
    judul: `${normalizedLabel} — catatan`,
    isi: outline,
  };
}
