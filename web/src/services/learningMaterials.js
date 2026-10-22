import { supabase } from '../lib/supabase.ts';

const BUCKET = 'learning-materials';
const MAX_FILE_BYTES = 20 * 1024 * 1024;
const COLUMNS = 'id,tenant_id,owner_id,title,subject,kelas,file_name,mime_type,storage_path,created_at';
const MIME_BY_EXTENSION = {
  pdf: 'application/pdf',
  docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
};

function cleanText(value, label, max) {
  const result = String(value || '').trim();
  if (!result || result.length > max) throw new TypeError(`${label} wajib diisi (maks. ${max} karakter).`);
  return result;
}

function fileMime(file) {
  const extension = String(file?.name || '').split('.').at(-1)?.toLowerCase();
  const expected = MIME_BY_EXTENSION[extension];
  if (!expected || (file.type && file.type !== expected)) {
    throw new TypeError('Format materi harus PDF atau Word DOCX yang valid.');
  }
  return expected;
}

export async function daftarMateriBelajar(tenantId) {
  if (typeof tenantId !== 'string' || !tenantId.trim()) {
    throw new Error('Akun belum terhubung dengan tenant sekolah.');
  }
  const { data, error } = await supabase
    .from('learning_materials')
    .select(COLUMNS)
    .eq('tenant_id', tenantId)
    .order('created_at', { ascending: false })
    .limit(100);
  if (error) throw error;
  if (!Array.isArray(data)) throw new Error('Daftar materi dari server tidak valid.');
  return data;
}

export async function unggahMateriBelajar(tenantId, ownerId, input, file) {
  if (!tenantId || !ownerId) throw new Error('Akun guru belum terhubung ke tenant.');
  const title = cleanText(input.title, 'Judul materi', 160);
  const subject = cleanText(input.subject, 'Mata pelajaran', 80);
  const kelas = cleanText(input.kelas, 'Kelas', 30);
  const mimeType = fileMime(file);
  if (!(file instanceof Blob) || file.size < 1 || file.size > MAX_FILE_BYTES) {
    throw new TypeError('Ukuran berkas materi harus antara 1 byte dan 20 MB.');
  }
  const id = globalThis.crypto?.randomUUID?.();
  if (!id) throw new Error('Browser ini tidak mendukung pembuatan ID materi yang aman.');
  const safeName = file.name.replace(/[^\p{L}\p{N}._-]+/gu, '-').slice(-160);
  const storagePath = `${tenantId}/${ownerId}/${id}-${safeName}`;
  const { error: uploadError } = await supabase.storage.from(BUCKET).upload(storagePath, file, {
    contentType: mimeType,
    upsert: false,
  });
  if (uploadError) throw uploadError;

  const { data, error } = await supabase
    .from('learning_materials')
    .insert({
      tenant_id: tenantId,
      owner_id: ownerId,
      title,
      subject,
      kelas,
      file_name: file.name.slice(0, 255),
      mime_type: mimeType,
      storage_path: storagePath,
    })
    .select(COLUMNS)
    .single();
  if (error) {
    const { error: cleanupError } = await supabase.storage.from(BUCKET).remove([storagePath]);
    if (cleanupError) {
      console.error('[learning-materials] Gagal membersihkan file setelah metadata gagal:', cleanupError);
      throw new Error(`Materi gagal dicatat (${error.message}) dan file sementara gagal dibersihkan (${cleanupError.message}).`);
    }
    throw error;
  }
  return data;
}

export async function urlMateriBelajar(storagePath) {
  if (typeof storagePath !== 'string' || !storagePath.trim()) {
    throw new TypeError('Lokasi materi tidak valid.');
  }
  const { data, error } = await supabase.storage.from(BUCKET)
    .createSignedUrl(storagePath, 5 * 60);
  if (error) throw error;
  if (!data?.signedUrl) throw new Error('Server tidak mengembalikan tautan materi yang valid.');
  return data.signedUrl;
}

export async function hapusMateriBelajar(material) {
  if (!material?.id || !material.storage_path) throw new TypeError('Identitas materi tidak valid.');
  const { error: deleteError } = await supabase
    .from('learning_materials')
    .delete()
    .eq('id', material.id)
    .eq('storage_path', material.storage_path);
  if (deleteError) throw deleteError;
  const { error: storageError } = await supabase.storage.from(BUCKET).remove([material.storage_path]);
  if (storageError) {
    console.error('[learning-materials] Metadata dihapus tetapi file privat belum terhapus:', storageError);
    throw new Error(`Materi dihapus dari daftar, tetapi file privat gagal dibersihkan: ${storageError.message}`);
  }
}
