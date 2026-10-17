import { createClient } from '@supabase/supabase-js';

const testMode = import.meta.env.MODE === 'test';
const supabaseUrl = import.meta.env.VITE_SUPABASE_URL?.trim()
  || (testMode ? 'http://127.0.0.1:54321' : '');
const supabaseKey = import.meta.env.VITE_SUPABASE_ANON_KEY?.trim()
  || (testMode ? 'test-publishable-key' : '');

if (!supabaseUrl || !supabaseKey) {
  throw new Error(
    'Supabase belum dikonfigurasi. Atur VITE_SUPABASE_URL dan VITE_SUPABASE_ANON_KEY sebelum memakai Supabase.',
  );
}

let parsedUrl: URL;
try {
  parsedUrl = new URL(supabaseUrl);
} catch (cause) {
  throw new Error('VITE_SUPABASE_URL harus berupa URL yang valid.', { cause });
}

const localHosts = new Set(['localhost', '127.0.0.1', '[::1]']);
if (parsedUrl.protocol !== 'https:' && !localHosts.has(parsedUrl.hostname)) {
  throw new Error('VITE_SUPABASE_URL harus menggunakan HTTPS di luar localhost.');
}

export const supabase = createClient(supabaseUrl, supabaseKey, {
  auth: {
    autoRefreshToken: true,
    detectSessionInUrl: true,
    persistSession: true,
  },
});
