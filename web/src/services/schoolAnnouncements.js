import {
  isSupabaseConfigured,
  supabase,
  supabaseConfigError,
} from '../lib/supabase.ts';

const ROLES_MENGELOLA = new Set(['admin', 'admin_sekolah', 'operator']);
const ROLES_BACA = new Set([
  'admin', 'admin_sekolah', 'operator',
  'guru', 'guru_bk', 'guru_kokurikuler', 'guru_ekstrakurikuler',
  'siswa', 'ortu', 'orang_tua',
]);
const KOLOM = 'id, tenant_id, author_id, title, body, created_at';

function pastikanSupabase() {
  if (!isSupabaseConfigured) {
    throw new Error(
      supabaseConfigError?.message ||
      'Supabase belum dikonfigurasi; kanal pengumuman tidak tersedia.',
    );
  }
}

function validasiKonteks(context, perluPengelola = false) {
  const role = context?.activeRole || context?.role;
  if (!context?.userId || typeof context.userId !== 'string') {
    throw new Error('Sesi pengguna tidak valid. Silakan masuk kembali.');
  }
  if (!role || !ROLES_BACA.has(role)) {
    throw new Error('Peran aktif Anda tidak memiliki akses ke kanal pengumuman.');
  }
  if (perluPengelola && !ROLES_MENGELOLA.has(role)) {
    throw new Error('Kanal pengumuman hanya dapat dikelola admin sekolah atau operator.');
  }
  if (typeof context.tenantId !== 'string' || !context.tenantId.trim()) {
    throw new Error('Sekolah aktif tidak ditemukan. Pilih sekolah sebelum melanjutkan.');
  }
  return { role, tenantId: context.tenantId };
}

function validasiIsi(input) {
  const title = typeof input?.title === 'string' ? input.title.trim() : '';
  const body = typeof input?.body === 'string' ? input.body.trim() : '';
  if (!title || title.length > 200) {
    throw new TypeError('Judul wajib diisi dan maksimal 200 karakter.');
  }
  if (!body || body.length > 5000) {
    throw new TypeError('Isi pengumuman wajib diisi dan maksimal 5.000 karakter.');
  }
  return { title, body };
}

function dariBaris(row, tenantId) {
  if (!row || typeof row.id !== 'string' ||
      row.tenant_id !== tenantId ||
      typeof row.author_id !== 'string' ||
      typeof row.title !== 'string' ||
      typeof row.body !== 'string' ||
      typeof row.created_at !== 'string' ||
      !Number.isFinite(Date.parse(row.created_at))) {
    throw new Error('Supabase mengembalikan data pengumuman yang tidak valid.');
  }
  return {
    id: row.id,
    authorId: row.author_id,
    title: row.title,
    body: row.body,
    createdAt: row.created_at,
  };
}

function pastikanBerhasil({ data, error }, tindakan) {
  if (error) throw new Error(`Gagal ${tindakan}: ${error.message}`);
  return data;
}

export async function daftarPengumumanSekolah(context) {
  pastikanSupabase();
  const { tenantId } = validasiKonteks(context);
  const { data, error } = await supabase
    .from('school_announcements')
    .select(KOLOM)
    .eq('tenant_id', tenantId)
    .order('created_at', { ascending: false })
    .limit(100);
  const rows = pastikanBerhasil({ data, error }, 'memuat pengumuman');
  if (!Array.isArray(rows)) {
    throw new Error('Supabase mengembalikan daftar pengumuman yang tidak valid.');
  }
  return rows.map((row) => dariBaris(row, tenantId));
}

export async function buatPengumumanSekolah(context, input) {
  pastikanSupabase();
  const { tenantId } = validasiKonteks(context, true);
  const value = validasiIsi(input);
  const { data, error } = await supabase
    .from('school_announcements')
    .insert({
      tenant_id: tenantId,
      author_id: context.userId,
      title: value.title,
      body: value.body,
    })
    .select(KOLOM)
    .single();
  return dariBaris(pastikanBerhasil({ data, error }, 'menerbitkan pengumuman'), tenantId);
}

export async function perbaruiPengumumanSekolah(context, announcementId, input) {
  pastikanSupabase();
  const { tenantId } = validasiKonteks(context, true);
  if (typeof announcementId !== 'string' || !announcementId.trim()) {
    throw new TypeError('Identitas pengumuman tidak valid.');
  }
  const value = validasiIsi(input);
  const { data, error } = await supabase
    .from('school_announcements')
    .update({ title: value.title, body: value.body })
    .eq('id', announcementId)
    .eq('tenant_id', tenantId)
    .select(KOLOM)
    .single();
  return dariBaris(pastikanBerhasil({ data, error }, 'memperbarui pengumuman'), tenantId);
}

export async function hapusPengumumanSekolah(context, announcementId) {
  pastikanSupabase();
  const { tenantId } = validasiKonteks(context, true);
  if (typeof announcementId !== 'string' || !announcementId.trim()) {
    throw new TypeError('Identitas pengumuman tidak valid.');
  }
  const { error } = await supabase
    .from('school_announcements')
    .delete()
    .eq('id', announcementId)
    .eq('tenant_id', tenantId);
  if (error) throw new Error(`Gagal menghapus pengumuman: ${error.message}`);
}
