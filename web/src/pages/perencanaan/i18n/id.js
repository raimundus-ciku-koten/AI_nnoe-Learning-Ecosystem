/** Kamus Bahasa Indonesia. */
export default {
  /* umum */
  'umum.aksi': 'Aksi', 'umum.batal': 'Batal', 'umum.batalkan': 'Batalkan', 'umum.berhasilBuat': 'Dokumen berhasil dibuat.',
  'umum.berhasilHitung': 'Dokumen berhasil dihitung.', 'umum.buatAi': 'Buat dengan AI', 'umum.buatUlangAi': 'Buat ulang dengan AI',
  'umum.buka': 'Buka', 'umum.cetak': 'Cetak / Simpan PDF', 'umum.dibatalkan': 'Dibatalkan.', 'umum.fase': 'Fase',
  'umum.ganjil': 'Ganjil', 'umum.genap': 'Genap', 'umum.hapus': 'Hapus', 'umum.hitung': 'Hitung', 'umum.hitungUlang': 'Hitung ulang',
  'umum.jumlah': 'Jumlah', 'umum.kelas': 'Kelas', 'umum.konfirmasiTimpa': 'Dokumen ini sudah ada. Timpa dengan hasil baru?',
  'umum.membuat': 'Membuat…', 'umum.memuat': 'Memuat…', 'umum.menghitung': 'Menghitung…', 'umum.menit': 'menit',
  'umum.menungguAi': 'Menunggu AI menyusun dokumen. Ini dapat memakan waktu hingga satu-dua menit.', 'umum.pekan': 'pekan',
  'umum.semester': 'Semester', 'umum.simpan': 'Simpan', 'umum.timpa': 'Timpa', 'umum.tutup': 'Tutup', 'umum.ubah': 'Ubah', 'umum.ya': 'Ya',

  /* status, sumber, nama dokumen */
  'status.belum': 'Belum dibuat', 'status.siap': 'Siap', 'status.usang': 'Perlu diperbarui',
  'sumber.mesin': 'dihitung otomatis', 'sumber.ai': 'dibuat AI', 'sumber.manual': 'disunting manual',
  'dok.rpe': 'RPE', 'dok.cp': 'CP', 'dok.atp': 'ATP', 'dok.prota': 'Prota', 'dok.prosem': 'Prosem', 'dok.kktp': 'KKTP', 'dok.modul': 'Modul Ajar',

  /* hub */
  'hub.judul': 'Perencanaan Pembelajaran', 'hub.deskripsi': 'Hanya paket guru ini yang dibagikan secara eksplisit kepada akun admin Anda yang dapat dibuka. Pilih berkas yang dibagikan melalui Google Drive Picker; akses tetap hanya untuk membaca.',
  'hub.paketBaru': 'Paket baru', 'hub.kosong': 'Belum ada paket yang tersedia untuk akun ini.',
  'hub.kosongGuru': 'Belum ada paket perencanaan. Buat paket baru untuk memulai.',
  'hub.paketTerkunci': 'Paket Anda disimpan terenkripsi di Google Drive. Admin sekolah hanya dapat membaca paket setelah Anda memberi izin untuk paket tersebut.',
  'hub.legacyBelumDiimpor': 'Paket lama di Firestore belum diimpor. Paket yang tidak muncul di Drive bukan bukti bahwa data lama kosong.',
  'hub.pilihGuru': 'Pilih guru', 'hub.pilihGuruDeskripsi': 'Pilih akun guru untuk mengelola paket perencanaannya.',
  'hub.kelolaPaket': 'Kelola paket', 'hub.guruTanpaNama': 'Guru tanpa nama', 'hub.judulUntukGuru': 'Paket perencanaan · {nama}',
  'hub.tidakAdaGuru': 'Belum ada akun guru yang terdaftar di direktori.', 'hub.guruTidakDitemukan': 'Guru tidak ditemukan atau berada di luar sekolah Anda.',
  'hub.bukaPaket': 'Buka paket {nama}', 'hub.hapusPaket': 'Hapus paket {nama}',
  'hub.konfirmasiHapus': 'Hapus paket "{nama}" beserta seluruh dokumennya? Tindakan ini tidak dapat dibatalkan.',
  'hub.terhapus': 'Paket dihapus.', 'hub.peranTidakBoleh': 'Menu ini hanya tersedia untuk akun Guru dan Admin Sekolah pada tenant yang aktif.',

  /* detail */
  'detail.belumAda': 'Dokumen belum dibuat.', 'detail.kembali': 'Semua paket', 'detail.konteksTersimpan': 'Data paket disimpan. Dokumen turunan perlu diperbarui.',
  'detail.prasyarat': 'Selesaikan dahulu: {daftar}.', 'detail.sumber': 'Sumber: {sumber}', 'detail.tabLabel': 'Dokumen perencanaan',
  'detail.tidakDitemukan': 'Paket tidak ditemukan atau Anda tidak memiliki akses.', 'detail.ubahKonteks': 'Ubah data paket',
  'detail.dokumenKhususGuru': 'Dokumen RPE–Modul dibuat dan diperbarui dari akun guru.',
  'detail.aiNonaktif': 'Pembuatan berbantuan AI tidak aktif dalam mode tanpa billing.',
  'detail.manualGratis': 'Susun dan simpan dokumen ini secara manual tanpa provider AI atau biaya penggunaan.',
  'detail.usang': 'Dokumen ini dibuat dari versi sebelumnya dari dokumen induknya. Buat ulang agar tetap sinkron.',

  /* identitas & tanda tangan */
  'identitas.judul': 'Identitas dokumen', 'identitas.sekolah': 'Satuan pendidikan', 'identitas.guru': 'Nama guru', 'identitas.mapel': 'Mata pelajaran',
  'identitas.kelasFase': 'Kelas / Fase', 'identitas.tahunAjaran': 'Tahun ajaran', 'identitas.nip': 'NIP', 'identitas.kepsek': 'Kepala sekolah',
  'identitas.nipKepsek': 'NIP kepala sekolah', 'identitas.lokasi': 'Tempat penandatanganan',
  'ttd.kepsek': 'Mengetahui, Kepala Sekolah', 'ttd.guru': 'Guru Mata Pelajaran',

  /* RPE */
  'rpe.judul': 'Rincian Pekan Efektif', 'rpe.bagianSemester': 'Semester {semester}', 'rpe.tabelSemester': 'Rincian pekan Semester {semester}',
  'rpe.no': 'Pekan ke-', 'rpe.tanggal': 'Tanggal', 'rpe.status': 'Status', 'rpe.jp': 'JP', 'rpe.keterangan': 'Keterangan',
  'rpe.efektif': 'Efektif', 'rpe.nonEfektif': 'Tidak efektif', 'rpe.ket.efektif': 'Pembelajaran', 'rpe.ket.nonEfektif': 'Tidak efektif',
  'rpe.ket.sebagian': 'Pembelajaran · libur pada hari pembelajaran: {rinci}', 'rpe.jpPerPekan': 'Alokasi per pekan', 'rpe.hari': 'Hari pembelajaran',
  'rpe.totalJPHitung': 'Total JP hasil hitung', 'rpe.totalJPResmi': 'Total JP resmi (acuan)', 'rpe.rekap': 'Rekapitulasi pekan efektif',
  'rpe.totalPekan': 'Total pekan', 'rpe.pekanEfektif': 'Pekan efektif', 'rpe.pekanNon': 'Pekan tidak efektif',
  'rpe.peringatanSelisih': 'Total JP resmi ({resmi}) berbeda {selisih} JP dari hasil hitung kalender ({hitung}). Dokumen turunan memakai angka resmi.',
  'rpe.rumus': 'Total JP = (({g} + {n}) pekan efektif × {jp} JP) = {total} JP.',

  /* ATP */
  'cp.judul': 'Capaian Pembelajaran',
  'cp.impor': 'Impor CP dari Google Drive',
  'cp.pilihSumber': 'Pilih satu PDF CP dari folder sumber. Isi yang sesuai dengan mata pelajaran dan fase paket akan disalin ke paket terenkripsi Anda.',
  'cp.sumber': 'Sumber: {nama}',
  'cp.fase': 'Fase {fase}',
  'cp.tanggalImpor': 'Diimpor {tanggal}',
  'cp.kosong': 'Impor CP resmi sebelum membuat ATP.',
  'cp.peringatan': 'Pastikan mata pelajaran dan fase paket cocok dengan bagian CP di PDF. Periksa dokumen hasil impor sebelum digunakan.',
  'cp.galatSumber': 'Bagian CP untuk mata pelajaran dan fase paket ini tidak ditemukan dalam PDF terpilih.',
  'cp.berhasil': 'Draf CP berhasil diimpor ke paket terenkripsi Drive Anda.',
  'cp.memuat': 'Membaca dan memvalidasi PDF sumber…',
  'atp.judul': 'Alur Tujuan Pembelajaran', 'atp.bagianCp': '1. Capaian Pembelajaran', 'atp.bagianPeta': '2. Peta Sebaran Tujuan Pembelajaran',
  'atp.bagianSemester': '3. Pembagian Alur per Semester', 'atp.bagianRekap': '4. Rekap Alokasi Waktu Tahunan',
  'atp.elemen': 'Elemen', 'atp.cp': 'Capaian Pembelajaran', 'atp.unit': 'Unit', 'atp.modul': 'Modul', 'atp.kode': 'Kode TP', 'atp.tp': 'Tujuan Pembelajaran',
  'atp.materi': 'Materi esensial', 'atp.jp': 'JP', 'atp.kodeTerkait': 'Kode TP terkait', 'atp.jpTp': 'JP TP', 'atp.jpUh': 'JP UH', 'atp.subtotal': 'Subtotal JP',
  'atp.komponen': 'Komponen', 'atp.jumlahJp': 'Jumlah JP', 'atp.totalJP': 'Total JP', 'atp.jpTpGanjil': 'Σ JP TP Semester Ganjil', 'atp.jpTpGenap': 'Σ JP TP Semester Genap',
  'atp.uhGanjil': 'Ulangan Harian Ganjil', 'atp.uhGenap': 'Ulangan Harian Genap', 'atp.subtotalGanjil': 'Subtotal Semester Ganjil', 'atp.subtotalGenap': 'Subtotal Semester Genap',
  'atp.totalTahun': 'Total setahun',

  /* penyunting ATP */
  'atpEditor.mulai': 'Sunting ATP', 'atpEditor.susun': 'Susun ATP manual', 'atpEditor.drafKosong': 'Gunakan editor untuk menyusun TP berdasarkan CP sumber.',
  'atpEditor.elemenUnit': 'Elemen CP unit {no}', 'atpEditor.selesai': 'Selesai menyunting', 'atpEditor.simpanSemua': 'Simpan perubahan', 'atpEditor.tersimpan': 'Perubahan ATP disimpan.',
  'atpEditor.buangPerubahan': 'Ada perubahan yang belum disimpan. Buang perubahan?', 'atpEditor.tidakValid': 'ATP belum valid',
  'atpEditor.ringkas': 'Σ JP TP: {jpTp} dari target {target} (Ulangan Harian {uh}; total {total} JP)', 'atpEditor.selaraskan': 'Selaraskan JP otomatis',
  'atpEditor.ubahTp': 'Ubah TP {kode}', 'atpEditor.hapusTp': 'Hapus TP {kode}', 'atpEditor.hapusUnit': 'Hapus unit', 'atpEditor.tambahTp': 'Tambah TP', 'atpEditor.tambahUnit': 'Tambah unit',
  'atpEditor.unitBaru': 'Unit baru', 'atpEditor.unitKosong': 'Belum ada TP pada unit ini.', 'atpEditor.namaUnit': 'Nama unit {no}', 'atpEditor.semesterUnit': 'Semester unit {no}',
  'atpEditor.tabelUnit': 'TP pada unit {no}: {nama}', 'atpEditor.galatKode': 'Kode TP wajib diisi.', 'atpEditor.galatKodeGanda': 'Kode TP sudah dipakai.',
  'atpEditor.galatRumusan': 'Rumusan TP wajib diisi.', 'atpEditor.galatJp': 'JP harus bilangan bulat ≥ 1.',

  /* Prota & Prosem */
  'prota.judul': 'Program Tahunan', 'prota.bagianSemester': 'Semester {semester}', 'prota.tabelSemester': 'Program Tahunan Semester {semester}', 'prota.pekan': 'Pekan ke-',
  'prota.jpTp': 'JP untuk TP', 'prota.jpUh': 'JP Ulangan Harian', 'prota.ulanganHarian': 'Ulangan Harian Modul {no}', 'prota.jumlahSemester': 'Jumlah Semester {semester}',
  'prota.rumus': 'Σ JP TP ({tp}) + Σ JP Ulangan Harian ({uh}) = {total} JP.',
  'prosem.judul': 'Program Semester', 'prosem.bagianSemester': 'Semester {semester}', 'prosem.tabelSemester': 'Program Semester {semester}', 'prosem.bulan': 'Bulan',
  'prosem.pekan': 'Pekan ke-', 'prosem.kegiatan': 'TP / Kegiatan', 'prosem.uh': 'Ulangan Harian Modul {no}', 'prosem.sts': 'Sumatif Tengah Semester', 'prosem.sas': 'Sumatif Akhir Semester',
  'prosem.cadangan': 'Cadangan: remedial / pengayaan',
  'prosem.peringatanKurang': 'Pekan efektif tidak cukup: {jp} JP belum terjadwal. Periksa kalender libur atau Total JP.',
  'prosem.catatan': 'Sumatif Tengah dan Akhir Semester adalah penanda waktu pelaksanaan; JP-nya sudah termasuk dalam Total JP resmi.',

  /* KKTP */
  'kktp.judul': 'Kriteria Ketercapaian Tujuan Pembelajaran', 'kktp.ambang': 'Ambang ketercapaian', 'kktp.indikator': 'Indikator', 'kktp.level': 'Level', 'kktp.deskripsi': 'Deskripsi',
  'kktp.rubrikUntuk': 'Rubrik untuk {kode}', 'kktp.levelPerluBimbingan': 'Perlu bimbingan', 'kktp.levelCukup': 'Cukup', 'kktp.levelBaik': 'Baik', 'kktp.levelSangatBaik': 'Sangat baik',
  'kktp.editorPetunjuk': 'Isi indikator satu per baris dan rubrik untuk setiap level. Dokumen disimpan manual dan mengikuti revisi ATP.',
  'kktp.indikatorPetunjuk': 'Indikator (satu per baris)',

  /* Modul */
  'modul.judul': 'Modul Ajar', 'modul.model': 'Model pembelajaran', 'modul.tujuanKode': 'Tujuan pembelajaran', 'modul.pemahaman': 'Pemahaman bermakna', 'modul.pemantik': 'Pertanyaan pemantik',
  'modul.profil': 'Dimensi profil lulusan', 'modul.sarpras': 'Sarana dan prasarana', 'modul.pertemuan': 'Kegiatan pembelajaran', 'modul.pertemuanKe': 'Pertemuan {ke}',
  'modul.pendahuluan': 'Pendahuluan', 'modul.inti': 'Kegiatan inti', 'modul.penutup': 'Penutup', 'modul.asesmen': 'Asesmen', 'modul.diagnostik': 'Diagnostik', 'modul.formatif': 'Formatif',
  'modul.sumatif': 'Sumatif', 'modul.remedial': 'Remedial', 'modul.pengayaan': 'Pengayaan', 'modul.refleksi': 'Refleksi', 'modul.buatSemua': 'Buat semua modul',
  'modul.ringkas': '{siap} dari {total} modul siap', 'modul.selesaiSemua': '{n} dari {total} modul siap.',
  'modul.cpSumberAtp': 'Capaian Pembelajaran (sumber ATP)', 'modul.tpMateriSumberAtp': 'Tujuan Pembelajaran dan Materi (sumber ATP)',
  'modul.alokasiSumberProta': 'Alokasi waktu (sumber Prota)', 'modul.jadwalSumberProsem': 'Rencana pekan pembelajaran (sumber Prosem)',
  'modul.editorPetunjuk': 'Rancang modul untuk unit terpilih. Kosongkan bagian yang tidak digunakan; tujuan pembelajaran harus dipilih dari ATP.',
  'modul.listHint': 'maks. {max} butir, satu per baris',
  'modul.refleksiGuru': 'Refleksi guru', 'modul.refleksiSiswa': 'Refleksi siswa',
  'modul.judulPertemuan': 'Judul pertemuan', 'modul.tujuanPertemuan': 'Tujuan pertemuan', 'modul.durasiPertemuan': 'Durasi (menit)',
  'modul.pertemuanHint': 'Tambahkan rangkaian kegiatan sesuai kebutuhan; maksimal 12 pertemuan.',
  'modul.tambahPertemuan': 'Tambah pertemuan', 'modul.hapusPertemuan': 'Hapus pertemuan',

  /* formulir */
  'form.bagianMapel': 'Mata pelajaran', 'form.bagianJadwal': 'Jadwal', 'form.bagianKalender': 'Hari tidak efektif / khusus', 'form.bagianIdentitas': 'Identitas dokumen',
  'form.mapel': 'Mata pelajaran', 'form.kelas': 'Kelas', 'form.fase': 'Fase', 'form.tahunAjaran': 'Tahun ajaran', 'form.jpPerPekan': 'JP per pekan', 'form.totalJP': 'Total JP setahun (opsional)',
  'form.totalJPHint': 'Isi bila ada angka resmi dari struktur kurikulum sekolah. Kosong = dihitung dari kalender.', 'form.hari': 'Hari pembelajaran mapel ini',
  'form.ganjilMulai': 'Ganjil: mulai', 'form.ganjilSelesai': 'Ganjil: selesai', 'form.genapMulai': 'Genap: mulai', 'form.genapSelesai': 'Genap: selesai',
  'form.kalenderHint': 'Tambahkan libur nasional, ujian sekolah, atau hari masuk khusus. Tanggal selesai boleh kosong untuk satu hari.',
  'form.rujukanKalender': 'Dokumen rujukan kalender pendidikan TA 2026/2027',
  'form.rujukanProvinsi': 'Pedoman kalender pendidikan Provinsi Nusa Tenggara Timur',
  'form.rujukanFloresTimur': 'SK kalender pendidikan Kabupaten Flores Timur',
  'form.rujukanFrador': 'Kalender akademik SMA Swasta Katolik Frateran Podor (khusus SMA Frador)',
  'form.rujukanKalenderHint': 'Dokumen ini hanya sebagai acuan dan tidak mengisi kalender otomatis. Verifikasi tanggal dengan sekolah; kalender SMA Frador hanya berlaku untuk sekolah tersebut.',
  'form.kalMulai': 'Tanggal mulai', 'form.kalSelesai': 'Tanggal selesai', 'form.kalKet': 'Keterangan', 'form.kalJenis': 'Jenis', 'form.kalTidakEfektif': 'Tidak efektif', 'form.kalEfektif': 'Hari efektif khusus',
  'form.tambahKalender': 'Tambah entri', 'form.periksaIsian': 'Periksa kembali isian yang bertanda galat.',

  /* galat */
  'galat.UMUM': 'Terjadi kesalahan. Coba lagi.', 'galat.WAJIB': 'Wajib diisi.', 'galat.FASE_TIDAK_VALID': 'Pilih fase A–F.', 'galat.FORMAT_TAHUN_AJARAN': 'Gunakan format 2026/2027 (tahun berurutan).',
  'galat.JP_PER_PEKAN_DI_LUAR_BATAS': 'JP per pekan harus 1–20.', 'galat.TOTAL_JP_DI_LUAR_BATAS': 'Total JP harus 4–600.', 'galat.TANGGAL_TIDAK_VALID': 'Tanggal tidak valid.',
  'galat.SELESAI_SEBELUM_MULAI': 'Tanggal selesai tidak boleh sebelum tanggal mulai.', 'galat.RENTANG_TERLALU_PANJANG': 'Rentang semester terlalu panjang.',
  'galat.TUMPANG_TINDIH_SEMESTER': 'Semester Genap harus dimulai setelah Semester Ganjil berakhir.', 'galat.TERLALU_BANYAK_ENTRI': 'Terlalu banyak entri kalender.',
  'galat.ENTRI_KALENDER_TIDAK_VALID': 'Ada entri kalender dengan tanggal tidak valid.', 'galat.PILIH_HARI': 'Pilih minimal satu hari pembelajaran.',
  'galat.TOTAL_JP_TERLALU_KECIL': 'Total JP terlalu kecil untuk disusun.', 'galat.TIDAK_ADA_UNIT': 'ATP belum memiliki unit yang berisi TP.', 'galat.JP_TIDAK_CUKUP': 'Total JP tidak cukup untuk jumlah unit pada ATP.',
  'galat.ATP_TANPA_CP': 'Impor CP yang sesuai sebelum menyusun ATP.', 'galat.ELEMEN_CP_TIDAK_VALID': 'Data elemen CP tidak valid.', 'galat.UNIT_ELEMEN_CP_TIDAK_VALID': 'Pilih elemen CP yang sesuai untuk setiap unit.',
  'galat.KONFLIK_VERSI': 'Data diubah di tab atau perangkat lain. Muat ulang lalu coba lagi.', 'galat.BATAS_PAKET': 'Batas jumlah paket tercapai. Hapus paket lama terlebih dahulu.',
  'galat.AKSES_DITOLAK': 'Akses ditolak oleh aturan keamanan.', 'galat.JARINGAN': 'Koneksi bermasalah. Perubahan akan dikirim saat tersambung kembali.',
  'galat.AI_BELUM_LOGIN': 'Sesi berakhir. Silakan masuk kembali.', 'galat.AI_DITOLAK': 'Akun Anda tidak diizinkan memakai fitur AI.', 'galat.AI_KUOTA': 'Batas penggunaan AI tercapai. Coba lagi nanti.',
  'galat.AI_PRASYARAT': 'Dokumen prasyarat belum siap atau sudah usang.', 'galat.AI_MASUKAN': 'Permintaan tidak valid.', 'galat.AI_SEMENTARA': 'Layanan AI sedang sibuk. Coba lagi sebentar lagi.',
  'galat.AI_GAGAL': 'AI gagal menyusun dokumen yang valid. Coba lagi.'
};
