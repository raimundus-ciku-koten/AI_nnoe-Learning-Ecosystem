import { supabase } from '../lib/supabase.ts';

const FIELDS = 'id,tenant_id,author_id,title,body,created_at';
const MAX_TITLE = 200;
const MAX_BODY = 5000;

function requiredText(value, label, maxLength) {
  if (typeof value !== 'string') throw new TypeError(`${label} harus berupa teks.`);
  const text = value.trim();
  if (!text || text.length > maxLength || /[\u0000-\u001f\u007f]/.test(text)) {
    throw new TypeError(`${label} wajib diisi dan maksimal ${maxLength} karakter.`);
  }
  return text;
}

function mapAnnouncement(row) {
  if (!row || typeof row.id !== 'string' || typeof row.title !== 'string' ||
      typeof row.body !== 'string' || typeof row.created_at !== 'string') {
    throw new Error('Data pengumuman dari server tidak valid.');
  }
  return {
    id: row.id,
    tenantId: row.tenant_id,
    authorId: row.author_id,
    title: row.title,
    body: row.body,
    createdAt: row.created_at,
  };
}

function requireScope(tenantId) {
  if (typeof tenantId !== 'string' || !tenantId.trim()) {
    throw new Error('Akun belum terhubung ke sekolah.');
  }
  return tenantId.trim();
}

export async function muatPengumumanSekolah(tenantId) {
  const scope = requireScope(tenantId);
  const { data, error } = await supabase
    .from('school_announcements')
    .select(FIELDS)
    .eq('tenant_id', scope)
    .order('created_at', { ascending: false })
    .order('id', { ascending: false })
    .limit(200);
  if (error) throw error;
  if (!Array.isArray(data)) throw new Error('Daftar pengumuman sekolah tidak valid.');
  return data.map(mapAnnouncement);
}

export async function buatPengumumanSekolah(tenantId, authorId, draft) {
  const scope = requireScope(tenantId);
  if (typeof authorId !== 'string' || !authorId.trim()) {
    throw new Error('Akun belum masuk.');
  }
  const payload = {
    tenant_id: scope,
    author_id: authorId,
    title: requiredText(draft?.title, 'Judul', MAX_TITLE),
    body: requiredText(draft?.body, 'Isi pengumuman', MAX_BODY),
  };
  const { data, error } = await supabase
    .from('school_announcements')
    .insert(payload)
    .select(FIELDS)
    .single();
  if (error) throw error;
  return mapAnnouncement(data);
}

export async function ubahPengumumanSekolah(tenantId, announcementId, draft) {
  const scope = requireScope(tenantId);
  if (typeof announcementId !== 'string' || !announcementId.trim()) {
    throw new TypeError('ID pengumuman tidak valid.');
  }
  const { data, error } = await supabase
    .from('school_announcements')
    .update({
      title: requiredText(draft?.title, 'Judul', MAX_TITLE),
      body: requiredText(draft?.body, 'Isi pengumuman', MAX_BODY),
    })
    .eq('tenant_id', scope)
    .eq('id', announcementId)
    .select(FIELDS)
    .maybeSingle();
  if (error) throw error;
  if (!data) throw new Error('Pengumuman tidak ditemukan atau akses sekolah berubah.');
  return mapAnnouncement(data);
}

export async function hapusPengumumanSekolah(tenantId, announcementId) {
  const scope = requireScope(tenantId);
  if (typeof announcementId !== 'string' || !announcementId.trim()) {
    throw new TypeError('ID pengumuman tidak valid.');
  }
  const { data, error } = await supabase
    .from('school_announcements')
    .delete()
    .eq('tenant_id', scope)
    .eq('id', announcementId)
    .select('id')
    .maybeSingle();
  if (error) throw error;
  if (!data) throw new Error('Pengumuman tidak ditemukan atau akses sekolah berubah.');
}
