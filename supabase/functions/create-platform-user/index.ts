import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const allowedOrigins = new Set(
  (Deno.env.get('APP_ORIGINS') ?? '')
    .split(',')
    .map((origin) => origin.trim())
    .filter(Boolean),
);
const corsHeaders = {
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Content-Type': 'application/json',
};

const allowedRoles = new Set(['admin_sekolah', 'operator', 'guru', 'siswa', 'ortu']);

function response(status: number, body: Record<string, unknown>, origin: string) {
  const headers = new Headers(corsHeaders);
  if (allowedOrigins.has(origin)) {
    headers.set('Access-Control-Allow-Origin', origin);
    headers.set('Vary', 'Origin');
  }
  return new Response(JSON.stringify(body), { status, headers });
}

Deno.serve(async (request) => {
  const origin = request.headers.get('Origin') ?? '';
  const respond = (status: number, body: Record<string, unknown>) => response(status, body, origin);
  if (origin && !allowedOrigins.has(origin)) return respond(403, { error: 'origin-not-allowed' });
  if (request.method === 'OPTIONS') return respond(200, { ok: true });
  if (request.method !== 'POST') return respond(405, { error: 'method-not-allowed' });

  const authorization = request.headers.get('Authorization');
  if (!authorization?.startsWith('Bearer ')) return respond(401, { error: 'unauthorized' });

  const supabaseUrl = Deno.env.get('SUPABASE_URL');
  const anonKey = Deno.env.get('SUPABASE_ANON_KEY');
  const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  if (!supabaseUrl || !anonKey || !serviceRoleKey) {
    console.error('Missing Supabase function environment configuration.');
    return respond(500, { error: 'server-configuration-error' });
  }

  const token = authorization.slice('Bearer '.length);
  const callerClient = createClient(supabaseUrl, anonKey, {
    auth: { persistSession: false, autoRefreshToken: false },
    global: { headers: { Authorization: authorization } },
  });
  const { data: callerData, error: callerError } = await callerClient.auth.getUser(token);
  if (callerError || !callerData.user) return respond(401, { error: 'unauthorized' });

  const { data: callerProfile, error: profileError } = await callerClient
    .from('profiles')
    .select('role,active')
    .eq('id', callerData.user.id)
    .single();
  if (profileError || callerProfile?.role !== 'superadmin' || callerProfile.active !== true) {
    return respond(403, { error: 'forbidden' });
  }

  let input: Record<string, unknown>;
  try {
    input = await request.json();
  } catch {
    return respond(400, { error: 'invalid-json' });
  }

  const nama = typeof input.nama === 'string' ? input.nama.trim() : '';
  const email = typeof input.email === 'string' ? input.email.trim().toLowerCase() : '';
  const role = typeof input.role === 'string' ? input.role : '';
  const tenantId = typeof input.tenantId === 'string' ? input.tenantId.trim() : '';
  if (
    nama.length < 1 || nama.length > 120
    || email.length > 320 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)
    || !allowedRoles.has(role)
    || !tenantId
  ) {
    return respond(400, { error: 'invalid-user-input' });
  }

  const admin = createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { data: tenant, error: tenantError } = await admin
    .from('tenants')
    .select('id')
    .eq('id', tenantId)
    .eq('active', true)
    .maybeSingle();
  if (tenantError) {
    console.error('Failed to validate tenant:', tenantError);
    return respond(500, { error: 'tenant-validation-failed' });
  }
  if (!tenant) return respond(400, { error: 'tenant-not-found-or-inactive' });

  const { error: allowlistError } = await admin.from('user_allowlist').insert({
    email,
    role,
    tenant_id: tenantId,
    active: true,
  });
  if (allowlistError) {
    if (allowlistError.code === '23505') return respond(409, { error: 'email-already-allowlisted' });
    console.error('Failed to create user allowlist entry:', allowlistError);
    return respond(500, { error: 'allowlist-write-failed' });
  }

  const { data: invitation, error: invitationError } = await admin.auth.admin.inviteUserByEmail(email, {
    data: { full_name: nama },
    redirectTo: origin
      ? `${origin}/#/login`
      : undefined,
  });
  if (invitationError || !invitation.user) {
    if (invitation.user) {
      const { error: deleteUserError } = await admin.auth.admin.deleteUser(invitation.user.id);
      if (deleteUserError) console.error('Failed to roll back invited auth user:', deleteUserError);
    }
    const { error: cleanupError } = await admin.from('user_allowlist').delete().eq('email', email);
    if (cleanupError) console.error('Failed to roll back user allowlist entry:', cleanupError);
    console.error('Failed to invite user:', invitationError);
    return respond(invitationError?.status === 422 ? 409 : 502, { error: 'user-invitation-failed' });
  }

  return respond(201, {
    uid: invitation.user.id,
    email,
    role,
    tenantId,
    invitationEmailSent: true,
  });
});
