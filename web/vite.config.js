import { defineConfig } from 'vite';

const vercelSupabaseTargets = {
  preview: 'samszhfyhbjuculrcffg',
  production: 'jvcrmzmuxgyuetkjqady',
};

export function validateVercelSupabaseTarget(env = process.env) {
  const expectedProjectRef = vercelSupabaseTargets[env.VERCEL_ENV];
  if (!expectedProjectRef) return;

  const url = env.VITE_SUPABASE_URL?.trim();
  if (!url) {
    throw new Error(`VITE_SUPABASE_URL wajib diatur untuk deploy Vercel ${env.VERCEL_ENV}.`);
  }

  if (!env.VITE_SUPABASE_ANON_KEY?.trim()) {
    throw new Error(`VITE_SUPABASE_ANON_KEY wajib diatur untuk deploy Vercel ${env.VERCEL_ENV}.`);
  }

  let parsedUrl;
  try {
    parsedUrl = new URL(url);
  } catch {
    throw new Error(`VITE_SUPABASE_URL tidak valid untuk deploy Vercel ${env.VERCEL_ENV}.`);
  }

  const expectedHost = `${expectedProjectRef}.supabase.co`;
  if (parsedUrl.protocol !== 'https:' || parsedUrl.hostname !== expectedHost) {
    throw new Error(
      `Deploy Vercel ${env.VERCEL_ENV} harus menggunakan Supabase ${expectedProjectRef}.`,
    );
  }

  if (env.VERCEL_ENV === 'preview' && !env.VITE_TURNSTILE_SITE_KEY?.trim()) {
    throw new Error('VITE_TURNSTILE_SITE_KEY wajib diatur untuk deploy Vercel preview.');
  }

  const productionCaptchaVerified =
    env.PRODUCTION_CAPTCHA_VERIFIED?.trim().toLowerCase() === 'true';
  const productionDemoTrialVerified =
    env.PRODUCTION_DEMO_TRIAL_VERIFIED?.trim().toLowerCase() === 'true';
  const productionSchoolSignupVerified =
    env.PRODUCTION_SCHOOL_SIGNUP_VERIFIED?.trim().toLowerCase() === 'true';
  const demoTrialEnabled =
    env.VITE_PUBLIC_DEMO_TRIAL_ENABLED?.trim().toLowerCase() === 'true';
  const schoolSignupEnabled =
    env.VITE_PUBLIC_SCHOOL_SIGNUP_ENABLED?.trim().toLowerCase() === 'true';

  if (
    env.VERCEL_ENV === 'production'
    && env.VITE_TURNSTILE_SITE_KEY?.trim()
    && !productionCaptchaVerified
  ) {
    throw new Error(
      'PRODUCTION_CAPTCHA_VERIFIED=true wajib setelah Supabase Production memvalidasi Turnstile server-side dan uji token selesai.',
    );
  }

  if (env.VERCEL_ENV === 'production' && (demoTrialEnabled || schoolSignupEnabled)) {
    if (!env.VITE_TURNSTILE_SITE_KEY?.trim() || !productionCaptchaVerified) {
      throw new Error(
        'Pendaftaran publik Production memerlukan Turnstile site key dan PRODUCTION_CAPTCHA_VERIFIED=true setelah validasi server-side.',
      );
    }
  }

  if (
    env.VERCEL_ENV === 'production'
    && demoTrialEnabled
    && !productionDemoTrialVerified
  ) {
    throw new Error(
      'PRODUCTION_DEMO_TRIAL_VERIFIED=true wajib setelah migrasi dan alur trial Production lulus uji end-to-end.',
    );
  }

  if (
    env.VERCEL_ENV === 'production'
    && schoolSignupEnabled
    && !productionSchoolSignupVerified
  ) {
    throw new Error(
      'PRODUCTION_SCHOOL_SIGNUP_VERIFIED=true wajib setelah migrasi, RLS, dan alur review sekolah Production lulus uji.',
    );
  }

  const publicSignupEnabled = [
    env.VITE_PUBLIC_DEMO_TRIAL_ENABLED,
    env.VITE_PUBLIC_SCHOOL_SIGNUP_ENABLED,
  ].some((value) => value?.trim().toLowerCase() === 'true');
  if (
    env.VERCEL_ENV === 'preview'
    && publicSignupEnabled
    && env.STAGING_PUBLIC_SIGNUP_VERIFIED?.trim().toLowerCase() !== 'true'
  ) {
    throw new Error(
      'STAGING_PUBLIC_SIGNUP_VERIFIED=true wajib setelah migrasi dan CAPTCHA server-side Staging lulus uji sebelum signup publik diaktifkan.',
    );
  }
}

export default defineConfig(() => {
  validateVercelSupabaseTarget();

  return {
    server: {
      port: 5173,
      strictPort: true,
      host: true,
    },
    preview: {
      port: 4173,
      strictPort: true,
      host: true,
    },
    build: {
      outDir: 'dist',
      sourcemap: false,
      target: 'es2020',
      cssCodeSplit: true,
      emptyOutDir: true,
      rollupOptions: {
        output: {
          chunkFileNames: 'assets/[name]-[hash].js',
          entryFileNames: 'assets/[name]-[hash].js',
          assetFileNames: 'assets/[name]-[hash].[ext]',
        },
      },
    },
    esbuild: {
      drop: ['console', 'debugger'],
      legalComments: 'none',
    },
  };
});
