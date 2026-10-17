// src/types/schema.ts
export type DatabaseTimestamp = string | Date;

export type UserRole =
  | 'superadmin'
  | 'admin_sekolah'
  | 'operator'
  | 'guru'
  | 'siswa'
  | 'ortu'
  | 'orang_tua'
  | 'demo'
  | 'unprovisioned';

export interface UserDoc {
  uid: string;
  email: string;
  nama: string;
  role: UserRole;
  nip?: string;
  sekolahId: string;
  mapelIds: string[];
  kelasIds: string[];
  fotoUrl: string | null;
  telepon: string | null;
  geminiApiKey?: string; // Terenkripsi di sisi klien bila diisi
  aktif: boolean;
  lastLogin: DatabaseTimestamp;
  createdAt: DatabaseTimestamp;
  updatedAt: DatabaseTimestamp;
  deletedAt: DatabaseTimestamp | null;
}

export interface SekolahDoc {
  sekolahId: string;
  nama: string;
  npsn: string;
  alamat: string;
  kota: string;
  provinsi: string;
  kepsekUid: string;
  logoUrl: string | null;
  tahunAjaranAktif: string;
  semesterAktif: 'ganjil' | 'genap';
  paket: 'free' | 'premium';
  aktif: boolean;
  createdAt: DatabaseTimestamp;
  updatedAt: DatabaseTimestamp;
}

export interface TahunAjaranDoc {
  tahunId: string;
  nama: string;
  tanggalMulai: string;
  tanggalSelesai: string;
  semesterAktif: 'ganjil' | 'genap';
  jumlahPekanEfektif: number;
  aktif: boolean;
}

export interface KelasDoc {
  kelasId: string;
  nama: string;
  tingkat: 'X' | 'XI' | 'XII' | string;
  waliKelasUid: string;
  tahunAjaranId: string;
  jumlahSiswa: number;
  mapelIds: string[];
  createdAt: DatabaseTimestamp;
  updatedAt: DatabaseTimestamp;
}

export interface SiswaDoc {
  siswaId: string;
  nis: string;
  nisn: string;
  nama: string;
  jenisKelamin: 'L' | 'P';
  tanggalLahir: string;
  orangTuaUid: string | null;
  aktif: boolean;
}

export interface MapelDoc {
  mapelId: string;
  nama: string;
  kode: string;
  tingkat: string[];
  guruPengampuUids: string[];
}

export type JenisPerencanaan = 'RPE' | 'ATP' | 'PROTA' | 'PROSEM' | 'KKTP' | 'MODUL_AJAR' | 'MODUL_SISWA' | 'COVER';

export interface PerencanaanDoc {
  dokId: string;
  jenis: JenisPerencanaan;
  judul: string;
  guruUid: string;
  mapelId: string;
  kelasIds: string[];
  tahunAjaranId: string;
  semester: 'ganjil' | 'genap';
  konten: Record<string, unknown>;
  versi: number;
  status: 'draft' | 'final';
  driveFileId?: string; // ID Google Drive milik guru
  fileUrl: string | null;
  createdAt: DatabaseTimestamp;
  updatedAt: DatabaseTimestamp;
}

export interface JurnalDoc {
  jurnalId: string;
  guruUid: string;
  kelasId: string;
  mapelId: string;
  tanggal: string;
  jamKe: string;
  materi: string;
  tujuanPembelajaran: string;
  metode: string;
  jumlahHadir: number;
  jumlahAbsen: number;
  catatan: string;
  fotoUrl: string | null; // Base64 terkompresi atau Drive link
  createdAt: DatabaseTimestamp;
  updatedAt: DatabaseTimestamp;
}

export interface PresensiDoc {
  presensiId: string;
  kelasId: string;
  mapelId: string;
  guruUid: string;
  tanggal: string;
  jamKe: string;
  hadir: string[];
  sakit: string[];
  izin: string[];
  alpa: string[];
  createdAt: DatabaseTimestamp;
}

export interface BankSoalDoc {
  soalId: string;
  guruUid: string;
  mapelId: string;
  tingkat: string;
  topik: string;
  jenis: 'pilihan_ganda' | 'essay';
  levelKognitif: 'C1' | 'C2' | 'C3' | 'C4' | 'C5' | 'C6';
  pertanyaan: string;
  pilihan?: Record<string, string>;
  jawabanBenar?: string;
  pembahasan?: string;
  gambarUrl: string | null;
  bobot: number;
  tags: string[];
  sumber: 'AI' | 'Manual';
  createdAt: DatabaseTimestamp;
  updatedAt: DatabaseTimestamp;
}

export interface UjianDoc {
  ujianId: string;
  judul: string;
  guruUid: string;
  kelasIds: string[];
  mapelId: string;
  jumlahSoal: number;
  acakSoal: boolean;
  acakPilihan: boolean;
  durasiMenit: number;
  mulai: DatabaseTimestamp;
  selesai: DatabaseTimestamp;
  kkm: number;
  status: 'draft' | 'aktif' | 'selesai';
  createdAt: DatabaseTimestamp;
  updatedAt: DatabaseTimestamp;
}

export interface SubmissionDoc {
  submissionId: string;
  ujianId: string;
  siswaUid: string;
  kelasId: string;
  jawaban: Record<string, string>;
  jawabanEssay?: Record<string, string>;
  skorPg: number;
  skorEssay: number;
  skorTotal: number;
  status: 'mengerjakan' | 'selesai';
  waktuMulai: DatabaseTimestamp;
  waktuSelesai: DatabaseTimestamp;
  pelanggaran: string[];
  createdAt: DatabaseTimestamp;
}