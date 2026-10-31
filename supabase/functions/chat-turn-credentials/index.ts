import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.76.1';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const TTL_SECONDS = 60 * 60;

function jsonResponse(status: number, body: Record<string, unknown>) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}

function base64(bytes: Uint8Array) {
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary);
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
  const conversationId = (body as { conversationId?: unknown } | null)?.conversationId;
  if (typeof conversationId !== 'string' || !UUID.test(conversationId)) {
    return jsonResponse(400, { error: 'A valid conversation ID is required.' });
  }

  const supabaseUrl = Deno.env.get('SUPABASE_URL');
  const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  const sharedSecret = Deno.env.get('TURN_SHARED_SECRET');
  const rawUrls = Deno.env.get('TURN_URLS');
  if (!supabaseUrl || !serviceRoleKey || !sharedSecret || !rawUrls) {
    console.error('[chat-turn-credentials] Required server configuration is missing.');
    return jsonResponse(503, { error: 'Panggilan belum dikonfigurasi untuk lingkungan ini.' });
  }

  let urls: string[];
  try {
    const parsed: unknown = JSON.parse(rawUrls);
    if (!Array.isArray(parsed) || parsed.length === 0 ||
        parsed.some((url) => typeof url !== 'string' || !/^turns?:/i.test(url))) {
      throw new Error('TURN_URLS must contain one or more TURN URLs.');
    }
    urls = parsed;
  } catch {
    console.error('[chat-turn-credentials] TURN_URLS configuration is invalid.');
    return jsonResponse(500, { error: 'Konfigurasi server panggilan tidak valid.' });
  }

  const supabase = createClient(supabaseUrl, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
  const { data: authData, error: authError } = await supabase.auth.getUser(token);
  if (authError || !authData.user) return jsonResponse(401, { error: 'Authentication is invalid.' });

  const { data: conversation, error: conversationError } = await supabase
    .from('chat_conversations')
    .select('id,type,participant_ids')
    .eq('id', conversationId)
    .maybeSingle();
  if (conversationError) {
    console.error('[chat-turn-credentials] Conversation lookup failed:', conversationError.message);
    return jsonResponse(500, { error: 'Tidak dapat memverifikasi percakapan.' });
  }
  if (!conversation || !conversation.participant_ids.includes(authData.user.id)) {
    return jsonResponse(403, { error: 'Akun ini bukan peserta percakapan.' });
  }
  if (conversation.type !== 'direct' || conversation.participant_ids.length !== 2) {
    return jsonResponse(403, { error: 'Panggilan grup belum tersedia.' });
  }
  const peerId = conversation.participant_ids.find((id: string) => id !== authData.user.id);
  const { data: contact, error: contactError } = await supabase
    .from('chat_contacts')
    .select('id')
    .eq('status', 'accepted')
    .or(`and(from_user_id.eq.${authData.user.id},to_user_id.eq.${peerId}),and(from_user_id.eq.${peerId},to_user_id.eq.${authData.user.id})`)
    .maybeSingle();
  if (contactError) {
    console.error('[chat-turn-credentials] Contact lookup failed:', contactError.message);
    return jsonResponse(500, { error: 'Tidak dapat memverifikasi kontak.' });
  }
  if (!contact) return jsonResponse(403, { error: 'Panggilan hanya tersedia untuk kontak yang disetujui.' });

  const { data: profile, error: profileError } = await supabase
    .from('profiles')
    .select('active,role,tenant_id')
    .eq('id', authData.user.id)
    .maybeSingle();
  if (profileError) {
    console.error('[chat-turn-credentials] Profile lookup failed:', profileError.message);
    return jsonResponse(500, { error: 'Tidak dapat memverifikasi akun.' });
  }
  const claims = authData.user.app_metadata || {};
  const allowedRoles = new Set([
    'superadmin', 'admin_sekolah', 'operator', 'guru', 'siswa', 'ortu', 'orang_tua',
  ]);
  if (!profile?.active || profile.role !== claims.role ||
      !allowedRoles.has(profile.role) || claims.active !== true) {
    return jsonResponse(403, { error: 'Akun ini tidak diizinkan melakukan panggilan.' });
  }
  if (profile.role !== 'superadmin') {
    if (!profile.tenant_id) return jsonResponse(403, { error: 'Akun belum terhubung ke sekolah aktif.' });
    const { data: tenant, error: tenantError } = await supabase
      .from('tenants')
      .select('id')
      .eq('id', profile.tenant_id)
      .eq('active', true)
      .maybeSingle();
    if (tenantError) {
      console.error('[chat-turn-credentials] Tenant lookup failed:', tenantError.message);
      return jsonResponse(500, { error: 'Tidak dapat memverifikasi sekolah.' });
    }
    if (!tenant) return jsonResponse(403, { error: 'Sekolah tidak aktif.' });
  }

  const expiresAt = Math.floor(Date.now() / 1000) + TTL_SECONDS;
  const username = `${expiresAt}:${authData.user.id}`;
  const key = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(sharedSecret),
    { name: 'HMAC', hash: 'SHA-1' },
    false,
    ['sign'],
  );
  const signature = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(username));
  return jsonResponse(200, {
    iceServers: [{
      urls,
      username,
      credential: base64(new Uint8Array(signature)),
    }],
    expiresAt,
  });
});
