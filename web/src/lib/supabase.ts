import { createClient } from '@supabase/supabase-js';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL?.trim();
const supabaseKey = import.meta.env.VITE_SUPABASE_ANON_KEY?.trim();
const missingConfigMessage = 'Supabase belum dikonfigurasi. Atur VITE_SUPABASE_URL dan VITE_SUPABASE_ANON_KEY sebelum memakai Supabase.';
const authStorageKey = 'ale-auth-session';
const refreshTokenSentinel = 'ale-bff-managed-session';
const sessionMemory = new Map<string, string>();

async function readBffSession() {
  const response = await fetch('/api/auth/session', {
    credentials: 'same-origin',
    cache: 'no-store',
  });
  if (response.status === 401) return null;
  const result = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(result.error || 'Sesi tidak dapat dipulihkan dari server.');
  }
  if (!result.session?.access_token || result.session.refresh_token !== refreshTokenSentinel) {
    throw new Error('Respons pemulihan sesi server tidak valid.');
  }
  return JSON.stringify(result.session);
}

const authStorage = {
  async getItem(key: string) {
    if (sessionMemory.has(key)) return sessionMemory.get(key) || null;
    if (key === authStorageKey) {
      const session = await readBffSession();
      if (session) sessionMemory.set(key, session);
      return session;
    }
    return null;
  },
  async setItem(key: string, value: string) {
    if (key.includes('-code-verifier') && value.endsWith('/recovery')) {
      const response = await fetch('/api/auth/recovery/verifier', {
        method: 'POST',
        credentials: 'same-origin',
        cache: 'no-store',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ verifier: value }),
      });
      const result = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(result.error || 'Verifier pemulihan tidak dapat disimpan dengan aman.');
    }
    if (key === authStorageKey) {
      const session = JSON.parse(value);
      if (session.refresh_token !== refreshTokenSentinel) {
        throw new Error('Refresh token hanya boleh disimpan oleh BFF.');
      }
    }
    sessionMemory.set(key, value);
  },
  async removeItem(key: string) {
    sessionMemory.delete(key);
  },
};

async function authFetch(input: RequestInfo | URL, init?: RequestInit) {
  const requestUrl = new URL(input instanceof Request ? input.url : String(input));
  const configuredUrl = supabaseUrl ? new URL(supabaseUrl) : null;
  const isSupabaseAuth = Boolean(
    configuredUrl
    && requestUrl.origin === configuredUrl.origin
    && requestUrl.pathname.startsWith('/auth/v1/'),
  );
  if (!isSupabaseAuth) return fetch(input, init);

  if (requestUrl.pathname === '/auth/v1/token'
    && requestUrl.searchParams.get('grant_type') === 'refresh_token') {
    const response = await fetch('/api/auth/session', {
      credentials: 'same-origin',
      cache: 'no-store',
    });
    if (!response.ok) return response;
    const result = await response.json();
    return Response.json(result.session);
  }

  if (requestUrl.pathname === '/auth/v1/logout') {
    return fetch('/api/auth/session', {
      method: 'DELETE',
      credentials: 'same-origin',
      cache: 'no-store',
    });
  }

  return fetch(input, init);
}

function createUnavailableQueryChain() {
  const chain: Record<string, any> = {};
  const methods = [
    'select', 'insert', 'update', 'upsert', 'delete',
    'eq', 'neq', 'gt', 'gte', 'lt', 'lte', 'like', 'ilike', 'is', 'in', 'contains',
    'filter', 'order', 'limit', 'range', 'match', 'or', 'not', 'override', 'onConflict',
    'returns', 'throwOnError', 'single', 'maybeSingle', 'textSearch', 'csv',
  ];

  for (const method of methods) {
    chain[method] = (..._args: unknown[]) => {
      if (method === 'single' || method === 'maybeSingle') {
        return Promise.reject(new Error(missingConfigMessage));
      }
      return createUnavailableQueryChain();
    };
  }

  return chain;
}

const unavailableSupabase = {
  auth: {
    getSession: async () => ({ data: { session: null }, error: new Error(missingConfigMessage) }),
    getUser: async () => ({ data: { user: null }, error: new Error(missingConfigMessage) }),
    signInWithPassword: async () => { throw new Error(missingConfigMessage); },
    signInWithOAuth: async () => { throw new Error(missingConfigMessage); },
    signOut: async () => { throw new Error(missingConfigMessage); },
    resetPasswordForEmail: async () => { throw new Error(missingConfigMessage); },
    updateUser: async () => { throw new Error(missingConfigMessage); },
    refreshSession: async () => { throw new Error(missingConfigMessage); },
    onAuthStateChange: () => ({ data: { subscription: { unsubscribe() {} } } }),
  },
  from: () => createUnavailableQueryChain(),
  rpc: async () => { throw new Error(missingConfigMessage); },
  functions: {
    invoke: async () => { throw new Error(missingConfigMessage); },
  },
  storage: {
    from: () => {
      throw new Error(missingConfigMessage);
    },
  },
};

let resolvedSupabase: any = unavailableSupabase;
let validationError: Error | null = null;

if (supabaseUrl && supabaseKey) {
  try {
    const parsedUrl = new URL(supabaseUrl);
    const localHosts = new Set(['localhost', '127.0.0.1', '[::1]']);
    if (parsedUrl.protocol !== 'https:' && !localHosts.has(parsedUrl.hostname)) {
      throw new Error('VITE_SUPABASE_URL harus menggunakan HTTPS di luar localhost.');
    }
    resolvedSupabase = createClient(supabaseUrl, supabaseKey, {
      auth: {
        autoRefreshToken: true,
        detectSessionInUrl: false,
        flowType: 'pkce',
        persistSession: true,
        storage: authStorage,
        storageKey: authStorageKey,
      },
      global: { fetch: authFetch },
    });
  } catch (cause) {
    validationError = cause instanceof Error ? cause : new Error(missingConfigMessage);
    resolvedSupabase = unavailableSupabase;
  }
} else {
  validationError = new Error(missingConfigMessage);
}

export const isSupabaseConfigured = Boolean(supabaseUrl && supabaseKey) && validationError === null;
export const supabaseConfigError = validationError;
export const supabase = resolvedSupabase;
