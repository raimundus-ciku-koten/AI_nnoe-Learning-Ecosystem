import { supabase } from '../lib/supabase.ts';

const MAX_DATA_URL_LENGTH = 500_000;
const VALID_DATA_URL = /^data:image\/(?:png|jpeg|webp);base64,[A-Za-z0-9+/]+={0,2}$/;

export async function muatKopSekolah(tenantId) {
  if (!tenantId) throw new Error('Sekolah aktif tidak tersedia.');
  const { data, error } = await supabase
    .from('school_letterheads')
    .select('image_data_url')
    .eq('tenant_id', tenantId)
    .maybeSingle();
  if (error) throw error;
  return data?.image_data_url || '';
}

export async function simpanKopSekolah(tenantId, userId, imageDataUrl) {
  if (!tenantId || !userId) throw new Error('Pengguna dan sekolah aktif wajib tersedia.');
  if (typeof imageDataUrl !== 'string' ||
      imageDataUrl.length > MAX_DATA_URL_LENGTH ||
      !VALID_DATA_URL.test(imageDataUrl)) {
    throw new TypeError('Gambar kop sekolah tidak valid atau melebihi batas ukuran.');
  }
  const { data, error } = await supabase
    .from('school_letterheads')
    .upsert({
      tenant_id: tenantId,
      image_data_url: imageDataUrl,
      updated_by: userId,
    }, { onConflict: 'tenant_id' })
    .select('tenant_id,image_data_url')
    .single();
  if (error) throw error;
  if (!data?.image_data_url) throw new Error('Kop sekolah tidak berhasil disimpan.');
  return data.image_data_url;
}

export async function hapusKopSekolah(tenantId) {
  if (!tenantId) throw new Error('Sekolah aktif tidak tersedia.');
  const { error } = await supabase
    .from('school_letterheads')
    .delete()
    .eq('tenant_id', tenantId);
  if (error) throw error;
}
