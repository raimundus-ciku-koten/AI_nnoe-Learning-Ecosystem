import {
  isSupabaseConfigured,
  supabase,
  supabaseConfigError,
} from '../lib/supabase.ts';
import { menuUntukPeran } from '../navigasi.js';

const TABEL = 'private_workspace_records';
const STATUS = new Set(['planned', 'in_progress', 'done']);
const KOLOM = 'id, role, route, search, title, details, status, due_date, created_at, updated_at';

export class PrivateWorkspaceSchemaUnavailableError extends Error {
  constructor() {
    super('Modul catatan pribadi belum tersedia pada layanan sekolah. Catatan tidak disimpan.');
    this.name = 'PrivateWorkspaceSchemaUnavailableError';
  }
}

function validasiKonteks(context, route, search) {
  if (!isSupabaseConfigured) {
    throw new Error(
      supabaseConfigError?.message ||
      'Supabase belum dikonfigurasi; catatan tidak dapat dimuat atau disimpan.',
    );
  }
  const role = context?.activeRole || context?.role;
  if (!context?.userId || typeof context.userId !== 'string') {
    throw new Error('Sesi pengguna tidak valid. Silakan masuk kembali.');
  }
  if (!role || !menuUntukPeran(role).some((group) =>
    group.item.some((item) => item.path === route && (item.search || '') === search))) {
    throw new Error('Menu ini tidak tersedia untuk peran aktif Anda.');
  }
  if (role !== 'superadmin' && !context.tenantId) {
    throw new Error('Sekolah aktif tidak ditemukan. Pilih sekolah sebelum melanjutkan.');
  }
  return { role, tenantId: context.tenantId || null };
}

function validasiInput(input) {
  const title = typeof input?.title === 'string' ? input.title.trim() : '';
  const details = typeof input?.details === 'string' ? input.details.trim() : '';
  const status = input?.status || 'planned';
  const dueDate = input?.dueDate || null;
  if (!title || title.length > 120) {
    throw new TypeError('Judul wajib diisi dan maksimal 120 karakter.');
  }
  if (details.length > 6000) {
    throw new TypeError('Catatan maksimal 6.000 karakter.');
  }
  if (!STATUS.has(status)) {
    throw new TypeError('Status catatan tidak valid.');
  }
  if (dueDate !== null && (
    typeof dueDate !== 'string' ||
    !/^\d{4}-\d{2}-\d{2}$/.test(dueDate) ||
    !Number.isFinite(Date.parse(`${dueDate}T00:00:00Z`))
  )) {
    throw new TypeError('Tanggal target tidak valid.');
  }
  return { title, details, status, dueDate };
}

function dariBaris(row) {
  if (!row || typeof row.id !== 'string' ||
      typeof row.role !== 'string' ||
      typeof row.route !== 'string' ||
      typeof row.search !== 'string' ||
      typeof row.title !== 'string' ||
      typeof row.details !== 'string' ||
      !STATUS.has(row.status) ||
      (row.due_date !== null && typeof row.due_date !== 'string') ||
      typeof row.created_at !== 'string' ||
      typeof row.updated_at !== 'string') {
    throw new Error('Supabase mengembalikan catatan ruang kerja yang tidak valid.');
  }
  return {
    id: row.id,
    role: row.role,
    route: row.route,
    search: row.search,
    title: row.title,
    details: row.details,
    status: row.status,
    dueDate: row.due_date,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function pastikanBerhasil({ data, error }, tindakan) {
  if (error?.code === 'PGRST205' || error?.code === '42P01') {
    throw new PrivateWorkspaceSchemaUnavailableError();
  }
  if (error) throw new Error(`Gagal ${tindakan}: ${error.message}`);
  return data;
}

export async function daftarCatatanRuangKerja(context, route, search = '') {
  const { role } = validasiKonteks(context, route, search);
  const { data, error } = await supabase
    .from(TABEL)
    .select(KOLOM)
    .eq('user_id', context.userId)
    .eq('role', role)
    .eq('route', route)
    .eq('search', search)
    .order('updated_at', { ascending: false });
  const rows = pastikanBerhasil({ data, error }, 'memuat catatan');
  if (!Array.isArray(rows)) {
    throw new Error('Supabase mengembalikan daftar catatan yang tidak valid.');
  }
  return rows.map(dariBaris);
}

export async function buatCatatanRuangKerja(context, route, input, search = '') {
  const { role, tenantId } = validasiKonteks(context, route, search);
  const value = validasiInput(input);
  const { data, error } = await supabase
    .from(TABEL)
    .insert({
      user_id: context.userId,
      tenant_id: tenantId,
      role,
      route,
      search,
      title: value.title,
      details: value.details,
      status: value.status,
      due_date: value.dueDate,
    })
    .select(KOLOM)
    .single();
  return dariBaris(pastikanBerhasil({ data, error }, 'menyimpan catatan'));
}

export async function perbaruiCatatanRuangKerja(context, route, id, input, search = '') {
  const { role } = validasiKonteks(context, route, search);
  if (typeof id !== 'string' || !id.trim()) {
    throw new TypeError('Identitas catatan tidak valid.');
  }
  const value = validasiInput(input);
  const { data, error } = await supabase
    .from(TABEL)
    .update({
      title: value.title,
      details: value.details,
      status: value.status,
      due_date: value.dueDate,
    })
    .eq('id', id)
    .eq('user_id', context.userId)
    .eq('role', role)
    .eq('route', route)
    .eq('search', search)
    .select(KOLOM)
    .single();
  return dariBaris(pastikanBerhasil({ data, error }, 'memperbarui catatan'));
}

export async function hapusCatatanRuangKerja(context, route, id, search = '') {
  const { role } = validasiKonteks(context, route, search);
  if (typeof id !== 'string' || !id.trim()) {
    throw new TypeError('Identitas catatan tidak valid.');
  }
  const { error } = await supabase
    .from(TABEL)
    .delete()
    .eq('id', id)
    .eq('user_id', context.userId)
    .eq('role', role)
    .eq('route', route)
    .eq('search', search);
  if (error) throw new Error(`Gagal menghapus catatan: ${error.message}`);
}
