import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.76.1';
import webpush from 'npm:web-push@3.6.7';

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

function endpointAman(endpoint: string) {
  try {
    const url = new URL(endpoint);
    const host = url.hostname.toLowerCase();
    const allowedHosts = [
      'fcm.googleapis.com',
      'push.services.mozilla.com',
      'web.push.apple.com',
      'notify.windows.com',
    ];
    return url.protocol === 'https:'
      && !url.username
      && !url.password
      && (!url.port || url.port === '443')
      && allowedHosts.some((allowedHost) => host === allowedHost || host.endsWith(`.${allowedHost}`));
  } catch {
    return false;
  }
}

Deno.serve(async (request) => {
  if (request.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (request.method !== 'POST') return jsonResponse(405, { error: 'Method not allowed.' });

  const authorization = request.headers.get('Authorization');
  const token = authorization?.match(/^Bearer\s+(.+)$/i)?.[1];
  if (!token) return jsonResponse(401, { error: 'Authentication is required.' });

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return jsonResponse(400, { error: 'A valid JSON body is required.' });
  }

  const messageId = (body as { messageId?: unknown } | null)?.messageId;
  if (typeof messageId !== 'string' ||
    !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(messageId)) {
    return jsonResponse(400, { error: 'A valid message ID is required.' });
  }

  const supabaseUrl = Deno.env.get('SUPABASE_URL');
  const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  const vapidPublicKey = Deno.env.get('VAPID_PUBLIC_KEY');
  const vapidPrivateKey = Deno.env.get('VAPID_PRIVATE_KEY');
  const vapidSubject = Deno.env.get('VAPID_SUBJECT');
  if (!supabaseUrl || !serviceRoleKey || !vapidPublicKey || !vapidPrivateKey || !vapidSubject) {
    console.error('[chat-push] Required Supabase or VAPID configuration is missing.');
    return jsonResponse(500, { error: 'Push delivery is not configured.' });
  }

  const supabase = createClient(supabaseUrl, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
  const { data: authData, error: authError } = await supabase.auth.getUser(token);
  if (authError || !authData.user) return jsonResponse(401, { error: 'Authentication is invalid.' });

  const { data: message, error: messageError } = await supabase
    .from('chat_messages')
    .select('id,conversation_id,sender_id,type')
    .eq('id', messageId)
    .maybeSingle();
  if (messageError) {
    console.error('[chat-push] Failed to look up the message:', messageError.message);
    return jsonResponse(500, { error: 'Unable to verify the message.' });
  }
  if (!message) return jsonResponse(404, { error: 'Message not found.' });
  if (message.sender_id !== authData.user.id) return jsonResponse(403, { error: 'Only the sender can request delivery.' });

  const { data: conversation, error: conversationError } = await supabase
    .from('chat_conversations')
    .select('participant_ids,participant_names')
    .eq('id', message.conversation_id)
    .maybeSingle();
  if (conversationError) {
    console.error('[chat-push] Failed to look up the conversation:', conversationError.message);
    return jsonResponse(500, { error: 'Unable to verify conversation participants.' });
  }
  if (!conversation || !conversation.participant_ids.includes(authData.user.id)) {
    return jsonResponse(403, { error: 'The sender is not a conversation participant.' });
  }

  const { data: sender, error: senderError } = await supabase
    .from('profiles')
    .select('nama,active,role,tenant_id')
    .eq('id', authData.user.id)
    .maybeSingle();
  if (senderError) {
    console.error('[chat-push] Failed to look up the sender profile:', senderError.message);
    return jsonResponse(500, { error: 'Unable to verify the sender.' });
  }
  if (!sender || !sender.active || sender.role === 'unprovisioned') {
    return jsonResponse(403, { error: 'The sender is not active.' });
  }

  const recipients = conversation.participant_ids.filter((uid: string) => uid !== authData.user.id);
  const { data: recipientProfiles, error: recipientProfilesError } = recipients.length
    ? await supabase
      .from('profiles')
      .select('id,role,tenant_id,active')
      .in('id', recipients)
    : { data: [], error: null };
  if (recipientProfilesError) {
    console.error('[chat-push] Failed to verify recipient profiles:', recipientProfilesError.message);
    return jsonResponse(500, { error: 'Unable to verify recipients.' });
  }

  const tenantIds = [...new Set((recipientProfiles || [])
    .filter((profile) => profile.active && profile.role !== 'superadmin' && profile.role !== 'unprovisioned')
    .map((profile) => profile.tenant_id)
    .filter((tenantId): tenantId is string => typeof tenantId === 'string'))];
  const { data: activeTenants, error: tenantsError } = tenantIds.length
    ? await supabase.from('tenants').select('id').in('id', tenantIds).eq('active', true)
    : { data: [], error: null };
  if (tenantsError) {
    console.error('[chat-push] Failed to verify recipient tenants:', tenantsError.message);
    return jsonResponse(500, { error: 'Unable to verify recipient tenants.' });
  }
  const activeTenantIds = new Set((activeTenants || []).map((tenant) => tenant.id));
  const eligibleRecipients = (recipientProfiles || []).filter((profile) => (
    profile.active
    && profile.role !== 'unprovisioned'
    && (
      profile.role === 'superadmin'
      || (
        typeof profile.tenant_id === 'string'
        && activeTenantIds.has(profile.tenant_id)
        && (sender.role === 'superadmin' || profile.tenant_id === sender.tenant_id)
      )
    )
  )).map((profile) => profile.id);

  const { data: subscriptions, error: subscriptionsError } = eligibleRecipients.length
    ? await supabase
      .from('web_push_subscriptions')
      .select('id,user_id,endpoint,p256dh,auth_secret')
      .in('user_id', eligibleRecipients)
    : { data: [], error: null };
  if (subscriptionsError) {
    console.error('[chat-push] Failed to load recipient subscriptions:', subscriptionsError.message);
    return jsonResponse(500, { error: 'Unable to load notification subscriptions.' });
  }

  webpush.setVapidDetails(vapidSubject, vapidPublicKey, vapidPrivateKey);
  const { data: dispatch, error: dispatchError } = await supabase
    .from('chat_push_dispatches')
    .upsert({
      message_id: messageId,
      requested_by: authData.user.id,
    }, { onConflict: 'message_id', ignoreDuplicates: true })
    .select('message_id')
    .maybeSingle();
  if (dispatchError) {
    console.error('[chat-push] Failed to claim message delivery:', dispatchError.message);
    return jsonResponse(500, { error: 'Unable to schedule message notifications.' });
  }
  if (!dispatch) return jsonResponse(200, { delivered: 0, expired: 0, failed: 0, duplicate: true });
  if (!subscriptions?.length) return jsonResponse(200, { delivered: 0, expired: 0, failed: 0 });

  let expired = 0;
  let failed = 0;
  const validSubscriptions: Array<{
    id: string;
    user_id: string;
    endpoint: string;
    p256dh: string;
    auth_secret: string;
  }> = [];
  for (const subscription of subscriptions) {
    if (endpointAman(subscription.endpoint)) {
      validSubscriptions.push(subscription);
      continue;
    }

    const { error: deleteError } = await supabase
      .from('web_push_subscriptions')
      .delete()
      .eq('id', subscription.id)
      .eq('user_id', subscription.user_id);
    if (deleteError) {
      console.error('[chat-push] Failed to remove an invalid subscription endpoint:', deleteError.message);
      failed += 1;
    } else {
      expired += 1;
    }
  }
  if (validSubscriptions.length === 0) return jsonResponse(200, { delivered: 0, expired, failed });

  const senderName = conversation.participant_names?.[authData.user.id] || sender.nama || 'Seseorang';
  const notification = JSON.stringify({
    title: `${senderName} mengirim pesan`,
    body: 'Anda menerima pesan baru di chat.',
    url: '/#/chat',
  });

  const results = await Promise.all(validSubscriptions.map(async (subscription) => {
    try {
      await webpush.sendNotification({
        endpoint: subscription.endpoint,
        keys: { p256dh: subscription.p256dh, auth: subscription.auth_secret },
      }, notification, { TTL: 86400 });
      return 'delivered';
    } catch (error) {
      const statusCode = (error as { statusCode?: number })?.statusCode;
      if (statusCode === 404 || statusCode === 410) {
        const { error: deleteError } = await supabase
          .from('web_push_subscriptions')
          .delete()
          .eq('id', subscription.id)
          .eq('user_id', subscription.user_id);
        if (deleteError) {
          console.error('[chat-push] Failed to remove an expired subscription:', deleteError.message);
          return 'failed';
        }
        return 'expired';
      }
      console.error('[chat-push] Web Push delivery failed:', statusCode || 'unknown status');
      return 'failed';
    }
  }));

  return jsonResponse(200, {
    delivered: results.filter((result) => result === 'delivered').length,
    expired: expired + results.filter((result) => result === 'expired').length,
    failed: failed + results.filter((result) => result === 'failed').length,
  });
});
