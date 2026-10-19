import { validateVercelSupabaseTarget } from '../vite.config.js';

const env = {
  ...process.env,
  VERCEL_ENV: process.env.VERCEL_ENV || 'preview',
};

try {
  validateVercelSupabaseTarget(env);
  console.log(`Vercel ${env.VERCEL_ENV} target OK: ${env.VITE_SUPABASE_URL}`);
} catch (error) {
  console.error(error.message);
  process.exit(1);
}
