import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.76.1';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};
const REGISTRY_URL = 'https://sekolah.data.kemendikdasmen.go.id/v1/sekolah-service/sekolah/cari-sekolah';

type SchoolRecord = {
  npsn: string;
  nama: string;
  bentuk_pendidikan: string;
  propinsi: string;
  kabupaten_kota: string;
  alamat: string;
  status_sekolah: string;
  akreditasi: string;
  kode_pos: string;
  kecamatan: string;
};

function jsonResponse(status: number, body: Record<string, unknown>) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
  });
}

function asText(value: unknown) {
  return typeof value === 'string' ? value.trim() : '';
}

function normalizeRecord(value: unknown, npsn: string): SchoolRecord | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const row = value as Record<string, unknown>;
  const record: SchoolRecord = {
    npsn: asText(row.npsn),
    nama: asText(row.nama),
    bentuk_pendidikan: asText(row.bentuk_pendidikan),
    propinsi: asText(row.provinsi),
    kabupaten_kota: asText(row.kabupaten),
    alamat: asText(row.alamat_jalan),
    status_sekolah: asText(row.status_sekolah),
    akreditasi: asText(row.akreditasi),
    kode_pos: asText(row.kode_pos),
    kecamatan: asText(row.kecamatan),
  };
  if (record.npsn !== npsn || !record.nama || !record.bentuk_pendidikan ||
      !record.propinsi || !record.kabupaten_kota || !record.alamat) return null;
  return record;
}

Deno.serve(async (request) => {
  if (request.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (request.method !== 'POST') return jsonResponse(405, { error: 'Method not allowed.' });

  const token = request.headers.get('Authorization')?.match(/^Bearer\s+(.+)$/i)?.[1];
  if (!token) return jsonResponse(401, { error: 'Authentication is required.' });

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return jsonResponse(400, { error: 'A valid JSON body is required.' });
  }
  if (!body || typeof body !== 'object' || Array.isArray(body)) {
    return jsonResponse(400, { error: 'A valid school request is required.' });
  }
  const input = body as Record<string, unknown>;
  const npsn = asText(input.npsn);
  if (!/^\d{8}$/.test(npsn)) {
    return jsonResponse(400, { error: 'NPSN harus terdiri dari 8 digit.' });
  }

  const supabaseUrl = Deno.env.get('SUPABASE_URL');
  const anonKey = Deno.env.get('SUPABASE_ANON_KEY');
  const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  if (!supabaseUrl || !anonKey || !serviceRoleKey) {
    console.error('[school-registry] Supabase function configuration is missing.');
    return jsonResponse(500, { error: 'Verifikasi NPSN belum dikonfigurasi.' });
  }

  const authClient = createClient(supabaseUrl, anonKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
  const { data: authData, error: authError } = await authClient.auth.getUser(token);
  if (authError || !authData.user || !authData.user.email_confirmed_at) {
    return jsonResponse(401, { error: 'Akun terverifikasi diperlukan.' });
  }

  const admin = createClient(supabaseUrl, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
  const { data: profile, error: profileError } = await admin
    .from('profiles')
    .select('role,tenant_id')
    .eq('id', authData.user.id)
    .maybeSingle();
  if (profileError) {
    console.error('[school-registry] Failed to verify requester profile:', profileError.message);
    return jsonResponse(500, { error: 'Profil pemohon tidak dapat diverifikasi.' });
  }
  if (!profile || profile.role !== 'unprovisioned' || profile.tenant_id) {
    return jsonResponse(403, { error: 'Hanya akun yang belum terhubung ke tenant yang dapat mengajukan sekolah.' });
  }

  let upstream: Response;
  try {
    upstream = await fetch(REGISTRY_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify({
        page: 0,
        size: 10,
        keyword: npsn,
        kabupaten_kota: '',
        bentuk_pendidikan: '',
        status_sekolah: '',
      }),
      signal: AbortSignal.timeout(10_000),
    });
  } catch (error) {
    console.error('[school-registry] Ministry registry request failed:', error);
    return jsonResponse(502, { error: 'Referensi sekolah Kemendikdasmen tidak dapat dihubungi. Coba lagi nanti.' });
  }
  if (!upstream.ok) {
    console.error('[school-registry] Ministry registry returned HTTP', upstream.status);
    return jsonResponse(502, { error: 'Referensi sekolah Kemendikdasmen sedang bermasalah.' });
  }

  let registryResponse: unknown;
  try {
    registryResponse = await upstream.json();
  } catch {
    return jsonResponse(502, { error: 'Respons referensi sekolah tidak valid.' });
  }
  const registryData = registryResponse && typeof registryResponse === 'object'
    ? (registryResponse as { data?: unknown }).data
    : null;
  const rows = Array.isArray(registryData) ? registryData : [];
  const verified = rows
    .map((row) => normalizeRecord(row, npsn))
    .find((record) => record !== null) || null;
  const name = verified?.nama || asText(input.name);
  const educationLevel = verified?.bentuk_pendidikan || asText(input.educationLevel);
  const province = verified?.propinsi || asText(input.province);
  const city = verified?.kabupaten_kota || asText(input.city);
  const address = verified?.alamat || asText(input.address);
  if (!name || !educationLevel || !province || !city || !address) {
    return jsonResponse(400, {
      error: 'Data sekolah tidak ditemukan di referensi kementerian. Lengkapi identitas pengajuan untuk pemeriksaan superadmin.',
    });
  }

  const { data: requestId, error: submitError } = await admin.rpc('submit_school_registration_request_v2', {
    p_requester_id: authData.user.id,
    p_npsn: npsn,
    p_school_name: name,
    p_education_level: educationLevel,
    p_province: province,
    p_city: city,
    p_address: address,
    p_registry_data: verified,
  });
  if (submitError) {
    console.error('[school-registry] Could not submit verified school request:', submitError.message);
    const status = submitError.code === '23505' ? 409 : submitError.code === '42501' ? 403 : 400;
    return jsonResponse(status, {
      error: submitError.code === '23505'
        ? 'NPSN ini sudah terdaftar atau sedang menunggu persetujuan.'
        : 'Permohonan sekolah tidak dapat disimpan.',
    });
  }
  return jsonResponse(200, {
    requestId,
    status: 'pending',
    verified: Boolean(verified),
    school: verified,
  });
});
