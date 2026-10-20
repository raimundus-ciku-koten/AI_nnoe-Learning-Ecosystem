import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.76.1';

function jsonResponse(status: number, message: string) {
  return new Response(message, {
    status,
    headers: { 'Content-Type': 'text/plain; charset=utf-8', 'Cache-Control': 'no-store' },
  });
}

function decodeBase64(value: string) {
  const binary = atob(value);
  return Uint8Array.from(binary, (character) => character.charCodeAt(0));
}

function encodeBase64(value: Uint8Array) {
  let binary = '';
  for (const byte of value) binary += String.fromCharCode(byte);
  return btoa(binary);
}

function parseKeyRing(raw: string) {
  let ring: { active?: unknown; keys?: unknown };
  try {
    ring = JSON.parse(raw);
  } catch {
    throw new Error('AI_CREDENTIALS_KEYRING must be valid JSON.');
  }
  if (
    typeof ring.active !== 'string'
    || !ring.keys
    || typeof ring.keys !== 'object'
    || Array.isArray(ring.keys)
  ) {
    throw new Error('AI_CREDENTIALS_KEYRING is missing an active key.');
  }
  const keys = ring.keys as Record<string, unknown>;
  const activeKey = keys[ring.active];
  if (typeof activeKey !== 'string') {
    throw new Error('AI_CREDENTIALS_KEYRING active key is unavailable.');
  }
  const key = decodeBase64(activeKey);
  if (key.length !== 32 || encodeBase64(key) !== activeKey) {
    throw new Error('AI_CREDENTIALS_KEYRING active key must be 32 bytes encoded as base64.');
  }
  return { version: ring.active, key };
}

async function encryptSecret(value: string, rawKeyRing: string, context: string) {
  const ring = parseKeyRing(rawKeyRing);
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const key = await crypto.subtle.importKey('raw', ring.key, 'AES-GCM', false, ['encrypt']);
  const data = await crypto.subtle.encrypt({
    name: 'AES-GCM',
    iv,
    additionalData: new TextEncoder().encode(context),
  }, key, new TextEncoder().encode(value));
  return { version: ring.version, iv: encodeBase64(iv), data: encodeBase64(new Uint8Array(data)) };
}

async function sha256(value: string) {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value));
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, '0'))
    .join('');
}

Deno.serve(async (request) => {
  if (request.method !== 'GET') return jsonResponse(405, 'Canva callback requires GET.');
  const url = new URL(request.url);
  const code = url.searchParams.get('code') || '';
  const state = url.searchParams.get('state') || '';
  if (!code || !state || code.length > 4096 || state.length > 128) {
    return jsonResponse(400, 'Canva authorization was not completed. Return to the app and try again.');
  }

  const supabaseUrl = Deno.env.get('SUPABASE_URL');
  const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  const clientId = Deno.env.get('CANVA_CLIENT_ID');
  const clientSecret = Deno.env.get('CANVA_CLIENT_SECRET');
  const redirectUri = Deno.env.get('CANVA_REDIRECT_URI');
  const appUrl = Deno.env.get('CANVA_APP_URL');
  const keyRingSecret = Deno.env.get('AI_CREDENTIALS_KEYRING');
  if (!supabaseUrl || !serviceRoleKey || !clientId || !clientSecret || !redirectUri || !appUrl || !keyRingSecret) {
    console.error('[canva-oauth-callback] Canva or Supabase configuration is missing.');
    return jsonResponse(503, 'Canva is not configured. Return to the app and contact the administrator.');
  }
  let expectedRedirectUri: string;
  try {
    expectedRedirectUri = new URL('/functions/v1/canva-oauth-callback', supabaseUrl).toString();
  } catch {
    console.error('[canva-oauth-callback] SUPABASE_URL is invalid.');
    return jsonResponse(503, 'Canva callback is not configured correctly. Contact the administrator.');
  }
  if (redirectUri !== expectedRedirectUri) {
    console.error('[canva-oauth-callback] CANVA_REDIRECT_URI does not match this project callback.');
    return jsonResponse(503, 'Canva callback is not configured correctly. Contact the administrator.');
  }

  let safeAppUrl: URL;
  try {
    safeAppUrl = new URL(appUrl);
  } catch {
    console.error('[canva-oauth-callback] The configured app return URL is invalid.');
    return jsonResponse(503, 'Canva is not configured. Return to the app and contact the administrator.');
  }
  if (
    (safeAppUrl.protocol !== 'https:' && safeAppUrl.hostname !== 'localhost')
    || safeAppUrl.username
    || safeAppUrl.password
  ) {
    console.error('[canva-oauth-callback] The configured app return URL is unsafe.');
    return jsonResponse(503, 'Canva is not configured. Return to the app and contact the administrator.');
  }

  let ring: ReturnType<typeof parseKeyRing>;
  try {
    ring = parseKeyRing(keyRingSecret);
  } catch {
    console.error('[canva-oauth-callback] Credential encryption is misconfigured.');
    return jsonResponse(503, 'Canva is not configured. Return to the app and contact the administrator.');
  }

  const supabase = createClient(supabaseUrl, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
  const { data: stateData, error: stateError } = await supabase
    .from('canva_oauth_states')
    .delete()
    .eq('state_hash', await sha256(state))
    .gt('expires_at', new Date().toISOString())
    .select('user_id,code_verifier')
    .maybeSingle();
  if (stateError) {
    console.error('[canva-oauth-callback] Failed to consume OAuth state:', stateError.message);
    return jsonResponse(503, 'Canva authorization is temporarily unavailable.');
  }
  if (!stateData?.user_id || !stateData.code_verifier) {
    return jsonResponse(400, 'Canva authorization expired or was already used. Return to the app and try again.');
  }

  const { data: profile, error: profileError } = await supabase
    .from('profiles')
    .select('active')
    .eq('id', stateData.user_id)
    .maybeSingle();
  if (profileError) {
    console.error('[canva-oauth-callback] Failed to verify the active profile:', profileError.message);
    return jsonResponse(503, 'Canva authorization is temporarily unavailable.');
  }
  if (profile?.active !== true) return jsonResponse(403, 'This account is no longer active.');

  try {
    const tokenResponse = await fetch('https://api.canva.com/rest/v1/oauth/token', {
      method: 'POST',
      headers: {
        Authorization: `Basic ${btoa(`${clientId}:${clientSecret}`)}`,
        'content-type': 'application/x-www-form-urlencoded',
      },
      body: new URLSearchParams({
        grant_type: 'authorization_code',
        code,
        code_verifier: stateData.code_verifier,
        redirect_uri: redirectUri,
      }),
      signal: AbortSignal.timeout(15_000),
    });
    if (!tokenResponse.ok) {
      console.warn('[canva-oauth-callback] Token exchange failed:', tokenResponse.status);
      return jsonResponse(502, 'Canva authorization could not be completed. Return to the app and try again.');
    }
    const token = await tokenResponse.json();
    if (
      typeof token.access_token !== 'string'
      || typeof token.refresh_token !== 'string'
      || !Number.isFinite(Number(token.expires_in))
    ) {
      return jsonResponse(502, 'Canva returned an invalid authorization response.');
    }

    const encryptedSecret = await encryptSecret(JSON.stringify({
      accessToken: token.access_token,
      refreshToken: token.refresh_token,
      expiresAt: Date.now() + Number(token.expires_in) * 1000,
    }), keyRingSecret, `${stateData.user_id}:canva`);
    const { error: saveError } = await supabase.from('user_ai_credentials').upsert({
      user_id: stateData.user_id,
      provider: 'canva',
      encrypted_secret: encryptedSecret,
      updated_at: new Date().toISOString(),
    }, { onConflict: 'user_id,provider' });
    if (saveError) {
      console.error('[canva-oauth-callback] Failed to save Canva credentials:', saveError.message);
      return jsonResponse(503, 'Canva connected, but the account link could not be saved.');
    }

    return new Response(null, {
      status: 303,
      headers: { Location: safeAppUrl.toString(), 'Cache-Control': 'no-store' },
    });
  } catch (error) {
    console.error('[canva-oauth-callback] OAuth callback failed:', error instanceof Error ? error.name : 'UnknownError');
    return jsonResponse(500, 'Canva could not be connected. Return to the app and try again.');
  }
});
