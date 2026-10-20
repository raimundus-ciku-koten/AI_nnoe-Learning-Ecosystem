import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.76.1';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

function jsonResponse(status: number, body: Record<string, unknown>) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
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
    return jsonResponse(400, { error: 'A valid invitation request is required.' });
  }

  const payload = body as { email?: unknown; nama?: unknown };
  const email = typeof payload.email === 'string' ? payload.email.trim().toLowerCase() : '';
  const nama = typeof payload.nama === 'string' ? payload.nama.trim() : '';
  if (
    email.length > 254
    || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)
    || nama.length < 2
    || nama.length > 120
    || /[\u0000-\u001f\u007f]/.test(nama)
  ) {
    return jsonResponse(400, { error: 'Nama dan email undangan tidak valid.' });
  }

  const supabaseUrl = Deno.env.get('SUPABASE_URL');
  const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  if (!supabaseUrl || !serviceRoleKey) {
    console.error('[platform-user-invite] Required Supabase configuration is missing.');
    return jsonResponse(500, { error: 'Layanan undangan belum dikonfigurasi.' });
  }

  const supabase = createClient(supabaseUrl, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
  const { data: authData, error: authError } = await supabase.auth.getUser(token);
  if (authError || !authData.user) {
    return jsonResponse(401, { error: 'Sesi masuk tidak valid.' });
  }

  const { data: claimsData, error: claimsError } = await supabase.auth.getClaims(token);
  if (claimsError || !claimsData?.claims) {
    console.error('[platform-user-invite] Failed to verify caller claims:', claimsError?.message || 'No claims returned.');
    return jsonResponse(401, { error: 'Klaim sesi tidak dapat diverifikasi.' });
  }
  if (claimsData.claims.aal !== 'aal2') {
    return jsonResponse(403, { error: 'Verifikasi MFA diperlukan untuk mengirim undangan.' });
  }

  const { data: actor, error: actorError } = await supabase
    .from('profiles')
    .select('role,active')
    .eq('id', authData.user.id)
    .maybeSingle();
  if (actorError) {
    console.error('[platform-user-invite] Failed to verify the caller:', actorError.message);
    return jsonResponse(500, { error: 'Tidak dapat memverifikasi izin superadmin.' });
  }
  if (actor?.role !== 'superadmin' || actor.active !== true) {
    return jsonResponse(403, { error: 'Hanya superadmin aktif yang dapat mengirim undangan.' });
  }

  const { data: allowlistEntry, error: allowlistError } = await supabase
    .from('user_allowlist')
    .select('email,role,active')
    .eq('email', email)
    .maybeSingle();
  if (allowlistError) {
    console.error('[platform-user-invite] Failed to verify the allowlist entry:', allowlistError.message);
    return jsonResponse(500, { error: 'Tidak dapat memverifikasi izin akun yang diundang.' });
  }
  if (!allowlistEntry?.active || allowlistEntry.role === 'superadmin') {
    return jsonResponse(403, { error: 'Akun harus memiliki allowlist aktif sebelum diundang.' });
  }

  const { data: invitation, error: inviteError } = await supabase.auth.admin.inviteUserByEmail(email, {
    data: { full_name: nama },
  });
  if (inviteError || !invitation.user) {
    console.error('[platform-user-invite] Invitation delivery failed:', inviteError?.message || 'No user returned.');
    return jsonResponse(502, { error: 'Undangan tidak berhasil dikirim. Periksa konfigurasi email Auth dan coba lagi.' });
  }

  return jsonResponse(200, { invited: true });
});
