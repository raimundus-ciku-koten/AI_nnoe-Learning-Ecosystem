// src/types/schema.ts
export type JsonValue = string | number | boolean | null | JsonValue[] | { [key: string]: JsonValue };
export type TimestampLike = string | number | Date;

export type UserRole =
  | 'superadmin'
  | 'admin_sekolah'
  | 'operator'
  | 'guru'
  | 'kepala_sekolah'
  | 'wali_kelas'
  | 'guru_bk'
  | 'guru_kokurikuler'
  | 'guru_ekstrakurikuler'
  | 'siswa'
  | 'ortu'
  | 'orang_tua';

export interface UserDoc {
  uid: string;
  email: string;
  nama: string;
  role: UserRole;
  roles?: UserRole[];
  nip?: string;
  sekolahId: string;
  mapelIds: string[];
  kelasIds: string[];
  fotoUrl: string | null;
  telepon: string | null;
  geminiApiKey?: string;
  aktif: boolean;
  lastLogin: TimestampLike | JsonValue;
  createdAt: TimestampLike | JsonValue;
  updatedAt: TimestampLike | JsonValue;
  deletedAt: TimestampLike | JsonValue | null;
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
  aktif: boolean;
  createdAt: TimestampLike | JsonValue;
  updatedAt: TimestampLike | JsonValue;
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
  createdAt: TimestampLike | JsonValue;
  updatedAt: TimestampLike | JsonValue;
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
  driveFileId?: string;
  fileUrl: string | null;
  createdAt: TimestampLike | JsonValue;
  updatedAt: TimestampLike | JsonValue;
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
  fotoUrl: string | null;
  createdAt: TimestampLike | JsonValue;
  updatedAt: TimestampLike | JsonValue;
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
  createdAt: TimestampLike | JsonValue;
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
  createdAt: TimestampLike | JsonValue;
  updatedAt: TimestampLike | JsonValue;
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
  mulai: TimestampLike | string;
  selesai: TimestampLike | string;
  kkm: number;
  status: 'draft' | 'aktif' | 'selesai';
  createdAt: TimestampLike | JsonValue;
  updatedAt: TimestampLike | JsonValue;
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
  waktuMulai: TimestampLike | string;
  waktuSelesai: TimestampLike | string;
  pelanggaran: string[];
  createdAt: TimestampLike | JsonValue;
}