import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.76.1';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

function jsonResponse(status: number, body: Record<string, unknown>) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
  });
}

function encodeBase64Url(value: Uint8Array) {
  let binary = '';
  for (const byte of value) binary += String.fromCharCode(byte);
  return btoa(binary).replaceAll('+', '-').replaceAll('/', '_').replace(/=+$/, '');
}

async function sha256(value: string) {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value));
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, '0'))
    .join('');
}

Deno.serve(async (request) => {
  if (request.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (request.method !== 'POST') return jsonResponse(405, { error: 'Method not allowed.' });

  const token = request.headers.get('Authorization')?.match(/^Bearer\s+(.+)$/i)?.[1];
  if (!token) return jsonResponse(401, { error: 'Sesi login diperlukan.' });

  const supabaseUrl = Deno.env.get('SUPABASE_URL');
  const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  const clientId = Deno.env.get('CANVA_CLIENT_ID');
  const redirectUri = Deno.env.get('CANVA_REDIRECT_URI');
  if (!supabaseUrl || !serviceRoleKey || !clientId || !redirectUri) {
    console.error('[canva-oauth-start] Canva or Supabase configuration is missing.');
    return jsonResponse(503, { error: 'Integrasi Canva belum dikonfigurasi oleh administrator.' });
  }
  let expectedRedirectUri: string;
  try {
    expectedRedirectUri = new URL('/functions/v1/canva-oauth-callback', supabaseUrl).toString();
  } catch {
    console.error('[canva-oauth-start] SUPABASE_URL is invalid.');
    return jsonResponse(503, { error: 'Integrasi Canva belum dikonfigurasi oleh administrator.' });
  }
  if (redirectUri !== expectedRedirectUri) {
    console.error('[canva-oauth-start] CANVA_REDIRECT_URI does not match this project callback.');
    return jsonResponse(503, { error: 'Callback Canva belum dikonfigurasi dengan benar.' });
  }

  const supabase = createClient(supabaseUrl, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
  const { data: authData, error: authError } = await supabase.auth.getUser(token);
  if (authError || !authData.user) return jsonResponse(401, { error: 'Sesi login tidak valid.' });

  const { data: profile, error: profileError } = await supabase
    .from('profiles')
    .select('active')
    .eq('id', authData.user.id)
    .maybeSingle();
  if (profileError) {
    console.error('[canva-oauth-start] Failed to verify the profile:', profileError.message);
    return jsonResponse(500, { error: 'Tidak dapat memverifikasi akun.' });
  }
  if (profile?.active !== true) return jsonResponse(403, { error: 'Akun belum aktif.' });

  const state = encodeBase64Url(crypto.getRandomValues(new Uint8Array(32)));
  const codeVerifier = encodeBase64Url(crypto.getRandomValues(new Uint8Array(32)));
  const codeChallenge = encodeBase64Url(new Uint8Array(
    await crypto.subtle.digest('SHA-256', new TextEncoder().encode(codeVerifier)),
  ));
  const { error: stateError } = await supabase.from('canva_oauth_states').insert({
    state_hash: await sha256(state),
    user_id: authData.user.id,
    code_verifier: codeVerifier,
    expires_at: new Date(Date.now() + 10 * 60 * 1000).toISOString(),
  });
  if (stateError) {
    console.error('[canva-oauth-start] Failed to save OAuth state:', stateError.message);
    return jsonResponse(503, { error: 'Sesi Canva tidak dapat dimulai.' });
  }

  const authorize = new URL('https://www.canva.com/api/oauth/authorize');
  authorize.search = new URLSearchParams({
    client_id: clientId,
    response_type: 'code',
    scope: 'design:content:write',
    redirect_uri: redirectUri,
    state,
    code_challenge: codeChallenge,
    code_challenge_method: 'S256',
  }).toString();
  return jsonResponse(200, { authorizationUrl: authorize.toString() });
});
