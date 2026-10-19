import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.76.1';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};
const PROVIDERS = ['gemini', 'deepseek', 'groq', 'claude'] as const;
type Provider = typeof PROVIDERS[number];
type ChatMessage = { role: 'user' | 'assistant'; text: string };

function jsonResponse(status: number, body: Record<string, unknown>) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
  });
}

function encodeBase64(value: Uint8Array) {
  let binary = '';
  for (const byte of value) binary += String.fromCharCode(byte);
  return btoa(binary);
}

function decodeBase64(value: string): Uint8Array<ArrayBuffer> {
  const binary = atob(value);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index);
  }
  return bytes;
}

function encodeBase64Url(value: Uint8Array) {
  return encodeBase64(value).replaceAll('+', '-').replaceAll('/', '_').replace(/=+$/, '');
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
  const keys = new Map<string, Uint8Array<ArrayBuffer>>();
  for (const [version, encoded] of Object.entries(ring.keys)) {
    if (!/^[A-Za-z0-9_-]{1,24}$/.test(version) || typeof encoded !== 'string') {
      throw new Error('AI_CREDENTIALS_KEYRING contains an invalid key entry.');
    }
    const key = decodeBase64(encoded);
    if (key.length !== 32 || encodeBase64(key) !== encoded) {
      throw new Error('Every AI credentials key must be 32 bytes encoded as base64.');
    }
    keys.set(version, key);
  }
  const activeKey = keys.get(ring.active);
  if (!activeKey) throw new Error('AI_CREDENTIALS_KEYRING active key is unavailable.');
  return { active: ring.active, keys, activeKey };
}

async function encryptSecret(value: string, rawKeyRing: string, context: string) {
  const ring = parseKeyRing(rawKeyRing);
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const key = await crypto.subtle.importKey('raw', ring.activeKey, 'AES-GCM', false, ['encrypt']);
  const encrypted = await crypto.subtle.encrypt({
    name: 'AES-GCM',
    iv,
    additionalData: new TextEncoder().encode(context),
  }, key, new TextEncoder().encode(value));
  return { version: ring.active, iv: encodeBase64(iv), data: encodeBase64(new Uint8Array(encrypted)) };
}

async function decryptSecret(record: unknown, rawKeyRing: string, context: string) {
  if (!record || typeof record !== 'object' || Array.isArray(record)) {
    throw new Error('Stored credential is invalid.');
  }
  const encrypted = record as { version?: unknown; iv?: unknown; data?: unknown };
  const ring = parseKeyRing(rawKeyRing);
  if (
    typeof encrypted.version !== 'string'
    || typeof encrypted.iv !== 'string'
    || typeof encrypted.data !== 'string'
  ) {
    throw new Error('Stored credential is invalid.');
  }
  const keyBytes = ring.keys.get(encrypted.version);
  if (!keyBytes) throw new Error('Stored credential encryption key is unavailable.');
  const key = await crypto.subtle.importKey('raw', keyBytes, 'AES-GCM', false, ['decrypt']);
  const plaintext = await crypto.subtle.decrypt({
    name: 'AES-GCM',
    iv: decodeBase64(encrypted.iv),
    additionalData: new TextEncoder().encode(context),
  }, key, decodeBase64(encrypted.data));
  return new TextDecoder().decode(plaintext);
}

function providerId(value: unknown): value is Provider {
  return typeof value === 'string' && PROVIDERS.includes(value as Provider);
}

function statusCode(error: unknown, fallback: string) {
  if (error && typeof error === 'object' && 'status' in error) {
    const status = error.status;
    if (typeof status === 'number' || typeof status === 'string') return status;
  }
  return fallback;
}

async function modelRequest(
  provider: Provider,
  apiKey: string,
  messages: ChatMessage[],
  { json = false, testOnly = false } = {},
) {
  const systemPrompt = 'You are a helpful educational assistant. Do not request or repeat passwords, API keys, or sensitive personal data.';
  const signal = AbortSignal.timeout(45_000);
  let url: string;
  let headers: Record<string, string>;
  let body: Record<string, unknown>;

  if (provider === 'gemini') {
    url = 'https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent';
    headers = { 'x-goog-api-key': apiKey };
    body = {
      systemInstruction: { parts: [{ text: systemPrompt }] },
      contents: messages.map((message) => ({
        role: message.role === 'assistant' ? 'model' : 'user',
        parts: [{ text: message.text }],
      })),
      generationConfig: { temperature: 0.5, maxOutputTokens: testOnly ? 16 : 2048, ...(json ? { responseMimeType: 'application/json' } : {}) },
    };
  } else if (provider === 'claude') {
    url = 'https://api.anthropic.com/v1/messages';
    headers = { 'x-api-key': apiKey, 'anthropic-version': '2023-06-01' };
    body = {
      model: 'claude-haiku-5-5',
      max_tokens: testOnly ? 16 : 2048,
      system: systemPrompt,
      messages: messages.map((message) => ({ role: message.role, content: message.text })),
    };
  } else {
    url = provider === 'deepseek'
      ? 'https://api.deepseek.com/chat/completions'
      : 'https://api.groq.com/openai/v1/chat/completions';
    headers = { Authorization: `Bearer ${apiKey}` };
    body = {
      model: provider === 'deepseek' ? 'deepseek-flash' : 'openai/gpt-oss-20b',
      messages: [
        { role: 'system', content: systemPrompt },
        ...messages.map((message) => ({ role: message.role, content: message.text })),
      ],
      temperature: 0.5,
      max_tokens: testOnly ? 16 : 2048,
      ...(json ? { response_format: { type: 'json_object' } } : {}),
    };
  }

  const response = await fetch(url, {
    method: 'POST',
    headers: { 'content-type': 'application/json', ...headers },
    body: JSON.stringify(body),
    signal,
  });
  if (!response.ok) throw Object.assign(new Error('Provider request failed.'), { status: response.status });

  const result = await response.json();
  const text = provider === 'gemini'
    ? result?.candidates?.[0]?.content?.parts?.map((part: { text?: string }) => part.text || '').join('')
    : provider === 'claude'
      ? result?.content?.filter((part: { type?: string }) => part.type === 'text').map((part: { text?: string }) => part.text || '').join('')
      : result?.choices?.[0]?.message?.content;
  if (typeof text !== 'string' || !text.trim()) {
    throw Object.assign(new Error('Provider returned an empty response.'), { status: 502 });
  }
  return text.trim();
}

function parseMessages(value: unknown): ChatMessage[] | null {
  if (!Array.isArray(value) || value.length < 1 || value.length > 16) return null;
  const messages: ChatMessage[] = [];
  for (const item of value) {
    if (
      !item
      || typeof item !== 'object'
      || !['user', 'assistant'].includes(item.role)
      || typeof item.text !== 'string'
      || item.text.trim().length < 1
      || item.text.length > 3000
    ) return null;
    messages.push({ role: item.role, text: item.text.trim() });
  }
  return messages.at(-1)?.role === 'user' ? messages : null;
}

function configuredProviders() {
  return Object.fromEntries(PROVIDERS.map((provider) => [
    provider,
    { personal: false, platform: false, available: false },
  ]));
}

Deno.serve(async (request) => {
  if (request.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (request.method !== 'POST') return jsonResponse(405, { error: 'Method not allowed.' });

  const token = request.headers.get('Authorization')?.match(/^Bearer\s+(.+)$/i)?.[1];
  if (!token) return jsonResponse(401, { error: 'Sesi login diperlukan.' });

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return jsonResponse(400, { error: 'Permintaan JSON tidak valid.' });
  }
  if (!body || typeof body !== 'object' || Array.isArray(body)) {
    return jsonResponse(400, { error: 'Permintaan AI tidak valid.' });
  }
  const payload = body as Record<string, unknown>;
  const action = payload.action;
  if (!['status', 'save-key', 'remove-key', 'assistant', 'question'].includes(String(action))) {
    return jsonResponse(400, { error: 'Aksi AI tidak dikenal.' });
  }

  const supabaseUrl = Deno.env.get('SUPABASE_URL');
  const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  const keyRingSecret = Deno.env.get('AI_CREDENTIALS_KEYRING');
  if (!supabaseUrl || !serviceRoleKey) {
    console.error('[ai-user-services] Required Supabase configuration is missing.');
    return jsonResponse(500, { error: 'Layanan AI belum dikonfigurasi.' });
  }
  if (keyRingSecret && action !== 'remove-key') {
    try {
      parseKeyRing(keyRingSecret);
    } catch (error) {
      console.error(
        '[ai-user-services] Credential encryption is misconfigured:',
        error instanceof Error ? error.message : 'UnknownError',
      );
      return jsonResponse(503, { error: 'Penyimpanan kunci AI belum dikonfigurasi dengan benar.' });
    }
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
    console.error('[ai-user-services] Failed to verify the active profile:', profileError.message);
    return jsonResponse(500, { error: 'Tidak dapat memverifikasi akun.' });
  }
  if (profile?.active !== true) return jsonResponse(403, { error: 'Akun belum aktif.' });

  if (action === 'status') {
    const providers = configuredProviders();
    const canvaConfigured = Boolean(
      keyRingSecret
      && Deno.env.get('CANVA_CLIENT_ID')
      && Deno.env.get('CANVA_CLIENT_SECRET')
      && Deno.env.get('CANVA_REDIRECT_URI')
      && Deno.env.get('CANVA_APP_URL'),
    );
    const { data: credentials, error: credentialError } = await supabase
      .from('user_ai_credentials')
      .select('provider')
      .eq('user_id', authData.user.id);
    if (credentialError) {
      console.error('[ai-user-services] Failed to load provider status:', credentialError.message);
      return jsonResponse(503, { error: 'Skema layanan AI belum diterapkan.' });
    }
    for (const credential of credentials || []) {
      if (credential.provider === 'canva') continue;
      if (providerId(credential.provider)) {
        providers[credential.provider] = { personal: true, platform: false, available: true };
      }
    }
    const canvaConnected = (credentials || []).some((credential) => credential.provider === 'canva');
    return jsonResponse(200, {
      configured: Boolean(keyRingSecret),
      canvaConfigured: Boolean(keyRingSecret) && canvaConfigured,
      providers: { ...providers, canva: { personal: canvaConnected, platform: false, available: canvaConnected, connected: canvaConnected } },
      preferences: { planning: 'auto', assistant: 'auto', questions: 'auto' },
    });
  }

  if (action === 'remove-key') {
    const provider = payload.provider;
    if (!providerId(provider) && provider !== 'canva') {
      return jsonResponse(400, { error: 'Provider tidak valid.' });
    }
    if (provider === 'canva') {
      const { data: canvaCredential, error: canvaCredentialError } = await supabase
        .from('user_ai_credentials')
        .select('encrypted_secret')
        .eq('user_id', authData.user.id)
        .eq('provider', 'canva')
        .maybeSingle();
      if (canvaCredentialError) {
        console.error('[ai-user-services] Failed to load Canva credentials for revocation:', canvaCredentialError.message);
        return jsonResponse(503, { error: 'Koneksi Canva tidak dapat diputus dengan aman.' });
      }
      if (canvaCredential) {
        const canvaClientId = Deno.env.get('CANVA_CLIENT_ID');
        const canvaClientSecret = Deno.env.get('CANVA_CLIENT_SECRET');
        if (!keyRingSecret || !canvaClientId || !canvaClientSecret) {
          return jsonResponse(503, { error: 'Konfigurasi Canva belum lengkap; token tidak dihapus agar dapat dicabut dengan aman.' });
        }
        try {
          const tokens = JSON.parse(await decryptSecret(
            canvaCredential.encrypted_secret,
            keyRingSecret,
            `${authData.user.id}:canva`,
          ));
          if (typeof tokens.refreshToken !== 'string') throw new Error('Canva refresh token is unavailable.');
          const revokeResponse = await fetch('https://api.canva.com/rest/v1/oauth/revoke', {
            method: 'POST',
            headers: {
              Authorization: `Basic ${btoa(`${canvaClientId}:${canvaClientSecret}`)}`,
              'content-type': 'application/x-www-form-urlencoded',
            },
            body: new URLSearchParams({ token: tokens.refreshToken }),
            signal: AbortSignal.timeout(15_000),
          });
          if (!revokeResponse.ok) {
            console.warn('[ai-user-services] Canva token revocation failed:', revokeResponse.status);
            return jsonResponse(502, { error: 'Canva belum mengonfirmasi pencabutan token; koneksi tetap tersimpan.' });
          }
        } catch (error) {
          console.error('[ai-user-services] Canva token revocation failed:', error instanceof Error ? error.name : 'UnknownError');
          return jsonResponse(502, { error: 'Canva belum dapat diputus. Coba lagi nanti.' });
        }
      }
    }
    const { error: removeError } = await supabase
      .from('user_ai_credentials')
      .delete()
      .eq('user_id', authData.user.id)
      .eq('provider', provider);
    if (removeError) {
      console.error('[ai-user-services] Failed to remove a credential:', removeError.message);
      return jsonResponse(500, { error: 'Kunci tidak dapat dihapus.' });
    }
    return jsonResponse(200, { provider, removed: true });
  }

  if (action === 'assistant' || action === 'question' || action === 'save-key') {
    const { data: controls, error: controlsError } = await supabase
      .from('platform_control')
      .select('features')
      .eq('id', 'global')
      .maybeSingle();
    if (controlsError) {
      console.error('[ai-user-services] Failed to load platform AI controls:', controlsError.message);
      return jsonResponse(503, { error: 'Pengaturan fitur AI belum dapat diverifikasi.' });
    }
    const features = controls?.features;
    const enabled = action === 'assistant'
      ? features?.aiAssistant === true
      : action === 'question'
        ? features?.aiGeneration === true
        : features?.aiAssistant === true || features?.aiGeneration === true;
    if (!enabled) {
      return jsonResponse(403, { error: 'Fitur AI ini sedang dinonaktifkan oleh administrator.' });
    }
  }

  if (!keyRingSecret) {
    return jsonResponse(503, { error: 'Superadmin perlu mengatur AI_CREDENTIALS_KEYRING pada secret Supabase Edge Functions.' });
  }

  if (action === 'save-key') {
    const provider = payload.provider;
    const apiKey = payload.apiKey;
    if (
      !providerId(provider)
      || typeof apiKey !== 'string'
      || apiKey.trim() !== apiKey
      || apiKey.length < 8
      || apiKey.length > 4096
      || /[\u0000-\u0020\u007f]/.test(apiKey)
    ) {
      return jsonResponse(400, { error: 'Provider atau kunci API tidak valid.' });
    }
    try {
      await modelRequest(provider, apiKey, [{ role: 'user', text: 'Reply with OK.' }], { testOnly: true });
      const encryptedSecret = await encryptSecret(apiKey, keyRingSecret, `${authData.user.id}:${provider}`);
      const { error: saveError } = await supabase.from('user_ai_credentials').upsert({
        user_id: authData.user.id,
        provider,
        encrypted_secret: encryptedSecret,
        updated_at: new Date().toISOString(),
      }, { onConflict: 'user_id,provider' });
      if (saveError) throw saveError;
      return jsonResponse(200, { provider, saved: true });
    } catch (error) {
      console.error('[ai-user-services] Provider key validation/save failed:', {
        provider,
        status: statusCode(error, 'server'),
      });
      return jsonResponse(502, { error: 'Kunci tidak berhasil diverifikasi atau disimpan. Periksa kunci dan kuota provider.' });
    }
  }

  if (action === 'assistant') {
    const messages = parseMessages(payload.messages);
    if (!messages) return jsonResponse(400, { error: 'Pesan harus berisi 1–16 teks, maksimal 3.000 karakter per pesan.' });
    const preference = payload.providerPreference;
    if (preference !== 'auto' && !providerId(preference)) {
      return jsonResponse(400, { error: 'Preferensi provider tidak valid.' });
    }

    const { data: credentials, error: credentialError } = await supabase
      .from('user_ai_credentials')
      .select('provider,encrypted_secret')
      .eq('user_id', authData.user.id)
      .in('provider', [...PROVIDERS]);
    if (credentialError) {
      console.error('[ai-user-services] Failed to load personal AI keys:', credentialError.message);
      return jsonResponse(503, { error: 'Kunci AI pribadi tidak dapat dimuat.' });
    }
    const byProvider = new Map((credentials || []).map((credential) => [credential.provider, credential]));
    const order = preference === 'auto'
      ? [...PROVIDERS]
      : [preference, ...PROVIDERS.filter((provider) => provider !== preference)];

    for (const provider of order) {
      const credential = byProvider.get(provider);
      if (!credential) continue;
      try {
        const apiKey = await decryptSecret(
          credential.encrypted_secret,
          keyRingSecret,
          `${authData.user.id}:${provider}`,
        );
        const answer = await modelRequest(provider, apiKey, messages);
        return jsonResponse(200, { answer, provider });
      } catch (error) {
        console.warn('[ai-user-services] Personal provider request failed:', {
          provider,
          status: statusCode(error, 'server'),
        });
      }
    }
    if (preference !== 'auto' && !byProvider.has(preference)) {
      return jsonResponse(412, { error: 'Kunci provider pilihan belum disimpan. Tambahkan kunci pada menu AI & Layanan.' });
    }
    return jsonResponse(502, { error: 'Semua provider AI pribadi yang tersedia gagal. Periksa kunci, kuota, dan status layanan.' });
  }

  const { mapel, kelas, topik, jenis } = payload;
  if (
    typeof mapel !== 'string' || mapel.trim().length < 1 || mapel.length > 120
    || typeof kelas !== 'string' || kelas.trim().length < 1 || kelas.length > 80
    || typeof topik !== 'string' || topik.trim().length < 1 || topik.length > 240
    || typeof jenis !== 'string' || !['pilihan_ganda', 'isian', 'uraian'].includes(jenis)
  ) {
    return jsonResponse(400, { error: 'Konteks pembuatan soal tidak valid.' });
  }
  const prompt = [
    'Buat satu draf soal pembelajaran dalam Bahasa Indonesia.',
    `Mata pelajaran: ${mapel.trim()}. Kelas: ${kelas.trim()}. Topik: ${topik.trim()}. Jenis: ${jenis}.`,
    'Kembalikan hanya JSON dengan bentuk {"questions":[{"pertanyaan":"...","pilihan":["..."],"jawaban":"...","pembahasan":"..."}]}.',
    'Untuk pilihan_ganda berikan tepat empat pilihan dan jawaban harus sama persis dengan salah satu pilihan. Untuk jenis lain, gunakan pilihan sebagai array kosong.',
  ].join('\n');
  const preference = payload.providerPreference;
  const messages = [{ role: 'user' as const, text: prompt }];
  const availableCredentials = await supabase
    .from('user_ai_credentials')
    .select('provider,encrypted_secret')
    .eq('user_id', authData.user.id)
    .in('provider', [...PROVIDERS]);
  if (availableCredentials.error) {
    console.error('[ai-user-services] Failed to load personal AI keys:', availableCredentials.error.message);
    return jsonResponse(503, { error: 'Kunci AI pribadi tidak dapat dimuat.' });
  }
  const selectedOrder = preference === 'auto' || preference === undefined
    ? [...PROVIDERS]
    : providerId(preference)
      ? [preference, ...PROVIDERS.filter((provider) => provider !== preference)]
      : null;
  if (!selectedOrder) return jsonResponse(400, { error: 'Preferensi provider tidak valid.' });
  for (const provider of selectedOrder) {
    const credential = availableCredentials.data?.find((item) => item.provider === provider);
    if (!credential) continue;
    try {
      const apiKey = await decryptSecret(
        credential.encrypted_secret,
        keyRingSecret,
        `${authData.user.id}:${provider}`,
      );
      const raw = await modelRequest(provider, apiKey, messages, { json: true });
      const start = raw.indexOf('{');
      const end = raw.lastIndexOf('}');
      const parsed = JSON.parse(start >= 0 && end > start ? raw.slice(start, end + 1) : raw);
      const item = parsed?.questions?.[0];
      if (
        typeof item?.pertanyaan !== 'string'
        || typeof item?.jawaban !== 'string'
        || typeof item?.pembahasan !== 'string'
        || !Array.isArray(item?.pilihan)
        || item.pertanyaan.length > 2000
        || item.jawaban.length > 500
        || item.pembahasan.length > 3000
        || item.pilihan.length > 6
        || item.pilihan.some((choice: unknown) => typeof choice !== 'string' || choice.length > 500)
        || (jenis === 'pilihan_ganda' && (item.pilihan.length !== 4 || !item.pilihan.includes(item.jawaban)))
      ) throw new Error('Generated question is invalid.');
      return jsonResponse(200, { payload: { questions: [item] }, provider });
    } catch (error) {
      console.warn('[ai-user-services] Question generation failed:', {
        provider,
        status: statusCode(error, 'invalid-output'),
      });
    }
  }
  return jsonResponse(502, { error: 'Soal tidak berhasil dibuat. Periksa kunci dan kuota provider AI pribadi.' });
});
