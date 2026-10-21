import { createClient } from '@supabase/supabase-js';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL?.trim();
const supabaseKey = import.meta.env.VITE_SUPABASE_ANON_KEY?.trim();
const missingConfigMessage = 'Supabase belum dikonfigurasi. Atur VITE_SUPABASE_URL dan VITE_SUPABASE_ANON_KEY sebelum memakai Supabase.';

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
        detectSessionInUrl: true,
        persistSession: true,
      },
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
