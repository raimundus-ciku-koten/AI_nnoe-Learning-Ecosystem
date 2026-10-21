import { supabase } from '../lib/supabase.ts';

const REQUEST_FIELDS = 'id,npsn,submitted_name,education_level,province,city,address,status,verified_name,created_at';

async function functionErrorMessage(error) {
  let message = error?.message || 'Permohonan sekolah tidak dapat dikirim.';
  if (error?.context instanceof Response) {
    try {
      const body = await error.context.clone().json();
      if (typeof body?.error === 'string') message = body.error;
    } catch {
      return message;
    }
  }
  return message;
}

export async function daftarPermohonanSekolah(userId) {
  if (!userId) throw new Error('Sesi pengguna tidak tersedia.');
  const { data, error } = await supabase
    .from('school_registration_requests_v2')
    .select(REQUEST_FIELDS)
    .eq('requester_id', userId)
    .order('created_at', { ascending: false })
    .limit(20);
  if (error) throw error;
  if (!Array.isArray(data)) throw new Error('Riwayat permohonan sekolah tidak valid.');
  return data;
}

export async function ajukanSekolah(input) {
  const { data, error } = await supabase.functions.invoke('school-registry', {
    body: {
      npsn: input.npsn,
      name: input.name,
      educationLevel: input.educationLevel,
      province: input.province,
      city: input.city,
      address: input.address,
    },
  });
  if (error) throw new Error(await functionErrorMessage(error));
  if (typeof data?.requestId !== 'string' || !data.requestId) {
    throw new Error('Server tidak mengembalikan ID permohonan yang valid.');
  }
  return data.requestId;
}

export async function tinjauPermohonanSekolah(requestId, officialRecord = null) {
  if (!requestId) throw new TypeError('ID permohonan sekolah tidak valid.');
  const approved = Boolean(officialRecord);
  const { data, error } = await supabase.rpc('review_school_registration_request_v2', {
    p_request_id: requestId,
    p_approve: approved,
    p_verified_name: officialRecord?.nama || null,
    p_registry_data: officialRecord,
  });
  if (error) throw error;
  if (!data || typeof data !== 'object') {
    throw new Error('Server tidak mengembalikan hasil tinjauan yang valid.');
  }
  return data;
}
