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

  const payload = body as { email?: unknown; nama?: unknown; redirectTo?: unknown } | null;
  if (!payload || typeof payload.email !== 'string' || typeof payload.nama !== 'string'
    || typeof payload.redirectTo !== 'string') {
    return jsonResponse(400, { error: 'A valid email, display name, and redirect URL are required.' });
  }
  const email = payload.email.trim().toLowerCase();
  const nama = payload.nama.trim();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email.length > 254
    || nama.length < 2 || nama.length > 120 || /[\u0000-\u001f\u007f]/.test(nama)) {
    return jsonResponse(400, { error: 'The email or display name is invalid.' });
  }
  const allowedAppOrigin = Deno.env.get('PLATFORM_APP_ORIGIN');
  let allowedOrigin: string;
  try {
    const parsedAllowedOrigin = new URL(allowedAppOrigin || '');
    if (parsedAllowedOrigin.origin !== allowedAppOrigin
      || (parsedAllowedOrigin.protocol !== 'https:'
        && parsedAllowedOrigin.hostname !== 'localhost'
        && parsedAllowedOrigin.hostname !== '127.0.0.1')) {
      throw new Error('PLATFORM_APP_ORIGIN must be an exact HTTPS origin.');
    }
    allowedOrigin = parsedAllowedOrigin.origin;
  } catch {
    console.error('[platform-invite-user] A valid PLATFORM_APP_ORIGIN is required.');
    return jsonResponse(500, { error: 'The application redirect origin is not configured.' });
  }
  const requestOrigin = request.headers.get('Origin');
  let redirectUrl: URL;
  try {
    redirectUrl = new URL(payload.redirectTo);
  } catch {
    return jsonResponse(400, { error: 'The invitation redirect URL is invalid.' });
  }
  if (!requestOrigin || requestOrigin !== allowedOrigin || redirectUrl.origin !== allowedOrigin
    || redirectUrl.username || redirectUrl.password) {
    return jsonResponse(400, { error: 'The invitation redirect URL must use the configured application origin.' });
  }

  const supabaseUrl = Deno.env.get('SUPABASE_URL');
  const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  if (!supabaseUrl || !serviceRoleKey) {
    console.error('[platform-invite-user] Required Supabase configuration is missing.');
    return jsonResponse(500, { error: 'User invitations are not configured.' });
  }

  const supabase = createClient(supabaseUrl, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
  const { data: authData, error: authError } = await supabase.auth.getUser(token);
  if (authError || !authData.user) return jsonResponse(401, { error: 'Authentication is invalid.' });

  const { data: actor, error: actorError } = await supabase
    .from('profiles')
    .select('active,role')
    .eq('id', authData.user.id)
    .maybeSingle();
  if (actorError) {
    console.error('[platform-invite-user] Failed to verify the caller profile:', actorError.message);
    return jsonResponse(500, { error: 'Unable to verify platform administrator access.' });
  }
  if (!actor || actor.active !== true || actor.role !== 'superadmin') {
    return jsonResponse(403, { error: 'An active superadmin account is required.' });
  }

  const { data: allowlist, error: allowlistError } = await supabase
    .from('user_allowlist')
    .select('email,role,active')
    .eq('email', email)
    .maybeSingle();
  if (allowlistError) {
    console.error('[platform-invite-user] Failed to verify the target allowlist:', allowlistError.message);
    return jsonResponse(500, { error: 'Unable to verify the user access record.' });
  }
  if (!allowlist || allowlist.active !== true || allowlist.role === 'superadmin') {
    return jsonResponse(409, { error: 'An active non-superadmin access record must be saved before inviting this user.' });
  }

  const { data: recentInvitation, error: auditQueryError } = await supabase
    .from('platform_audit')
    .select('id')
    .eq('action', 'platform.user.invited')
    .eq('after_value->>email', email)
    .gte('created_at', new Date(Date.now() - 60_000).toISOString())
    .limit(1)
    .maybeSingle();
  if (auditQueryError) {
    console.error('[platform-invite-user] Failed to check invitation rate limit:', auditQueryError.message);
    return jsonResponse(500, { error: 'Unable to verify invitation rate limits.' });
  }
  if (recentInvitation) {
    return jsonResponse(429, { error: 'An invitation was sent recently. Wait before requesting another one.' });
  }

  const { data: invitation, error: invitationError } = await supabase.auth.admin.inviteUserByEmail(email, {
    data: { full_name: nama },
    redirectTo: redirectUrl.toString(),
  });
  if (invitationError || !invitation.user) {
    console.error('[platform-invite-user] Auth invitation failed:', invitationError?.message || 'No invited user returned.');
    return jsonResponse(502, { error: 'The access record is saved, but Auth could not confirm the invitation. Check the user directory before retrying.' });
  }

  const { error: auditError } = await supabase.from('platform_audit').insert({
    actor_id: authData.user.id,
    action: 'platform.user.invited',
    target: invitation.user.id,
    after_value: { email, role: allowlist.role, invitation_sent: true },
  });
  if (auditError) {
    console.error('[platform-invite-user] Invitation was sent but audit logging failed:', auditError.message);
    return jsonResponse(500, { error: 'The invitation was sent, but audit logging failed. Verify the platform audit before retrying.' });
  }

  return jsonResponse(200, { invited: true });
});
