import assert from 'node:assert/strict';
import { test } from 'node:test';
import { deploymentArguments } from '../scripts/deploy-vercel.mjs';
import { validateVercelSupabaseTarget } from '../vite.config.js';

const productionUrl = 'https://jvcrmzmuxgyuetkjqady.supabase.co';
const stagingUrl = 'https://samszhfyhbjuculrcffg.supabase.co';

test('Vercel Preview must build against Supabase Staging and keep Turnstile enabled', () => {
  assert.doesNotThrow(() => validateVercelSupabaseTarget({
    VERCEL_ENV: 'preview',
    VITE_SUPABASE_URL: stagingUrl,
    VITE_SUPABASE_ANON_KEY: 'public-anon-key',
    VITE_TURNSTILE_SITE_KEY: 'public-turnstile-key',
  }));
  assert.throws(
    () => validateVercelSupabaseTarget({
      VERCEL_ENV: 'preview',
      VITE_SUPABASE_URL: productionUrl,
      VITE_SUPABASE_ANON_KEY: 'public-anon-key',
      VITE_TURNSTILE_SITE_KEY: 'public-turnstile-key',
    }),
    /harus menggunakan Supabase samszhfyhbjuculrcffg/,
  );
  assert.throws(
    () => validateVercelSupabaseTarget({
      VERCEL_ENV: 'preview',
      VITE_SUPABASE_URL: stagingUrl,
      VITE_SUPABASE_ANON_KEY: 'public-anon-key',
    }),
    /VITE_TURNSTILE_SITE_KEY wajib diatur/,
  );
  assert.throws(
    () => validateVercelSupabaseTarget({
      VERCEL_ENV: 'preview',
      VITE_SUPABASE_URL: stagingUrl,
      VITE_SUPABASE_ANON_KEY: 'public-anon-key',
      VITE_TURNSTILE_SITE_KEY: 'public-turnstile-key',
      VITE_PUBLIC_SCHOOL_SIGNUP_ENABLED: 'true',
    }),
    /STAGING_PUBLIC_SIGNUP_VERIFIED=true wajib/,
  );
  assert.doesNotThrow(() => validateVercelSupabaseTarget({
    VERCEL_ENV: 'preview',
    VITE_SUPABASE_URL: stagingUrl,
    VITE_SUPABASE_ANON_KEY: 'public-anon-key',
    VITE_TURNSTILE_SITE_KEY: 'public-turnstile-key',
    VITE_PUBLIC_SCHOOL_SIGNUP_ENABLED: 'true',
    STAGING_PUBLIC_SIGNUP_VERIFIED: 'true',
  }));
});

test('Vercel Production must build against Production Supabase and require verified Turnstile before signup', () => {
  assert.doesNotThrow(() => validateVercelSupabaseTarget({
    VERCEL_ENV: 'production',
    VITE_SUPABASE_URL: productionUrl,
    VITE_SUPABASE_ANON_KEY: 'public-anon-key',
  }));
  assert.throws(
    () => validateVercelSupabaseTarget({
      VERCEL_ENV: 'production',
      VITE_SUPABASE_URL: stagingUrl,
      VITE_SUPABASE_ANON_KEY: 'public-anon-key',
    }),
    /harus menggunakan Supabase jvcrmzmuxgyuetkjqady/,
  );
  assert.throws(
    () => validateVercelSupabaseTarget({
      VERCEL_ENV: 'production',
      VITE_SUPABASE_URL: productionUrl,
      VITE_SUPABASE_ANON_KEY: 'public-anon-key',
      VITE_TURNSTILE_SITE_KEY: 'public-turnstile-key',
    }),
    /PRODUCTION_CAPTCHA_VERIFIED=true wajib/,
  );
  assert.throws(
    () => validateVercelSupabaseTarget({
      VERCEL_ENV: 'production',
      VITE_SUPABASE_URL: productionUrl,
      VITE_SUPABASE_ANON_KEY: 'public-anon-key',
      VITE_PUBLIC_DEMO_TRIAL_ENABLED: 'true',
    }),
    /memerlukan Turnstile site key dan PRODUCTION_CAPTCHA_VERIFIED=true/,
  );
  assert.throws(
    () => validateVercelSupabaseTarget({
      VERCEL_ENV: 'production',
      VITE_SUPABASE_URL: productionUrl,
      VITE_SUPABASE_ANON_KEY: 'public-anon-key',
      VITE_PUBLIC_SCHOOL_SIGNUP_ENABLED: 'true',
    }),
    /memerlukan Turnstile site key dan PRODUCTION_CAPTCHA_VERIFIED=true/,
  );
  assert.throws(
    () => validateVercelSupabaseTarget({
      VERCEL_ENV: 'production',
      VITE_SUPABASE_URL: productionUrl,
      VITE_SUPABASE_ANON_KEY: 'public-anon-key',
      VITE_PUBLIC_DEMO_TRIAL_ENABLED: 'true',
      VITE_TURNSTILE_SITE_KEY: 'public-turnstile-key',
      PRODUCTION_CAPTCHA_VERIFIED: 'true',
    }),
    /PRODUCTION_DEMO_TRIAL_VERIFIED=true wajib/,
  );
  assert.throws(
    () => validateVercelSupabaseTarget({
      VERCEL_ENV: 'production',
      VITE_SUPABASE_URL: productionUrl,
      VITE_SUPABASE_ANON_KEY: 'public-anon-key',
      VITE_PUBLIC_SCHOOL_SIGNUP_ENABLED: 'true',
      VITE_TURNSTILE_SITE_KEY: 'public-turnstile-key',
      PRODUCTION_CAPTCHA_VERIFIED: 'true',
    }),
    /PRODUCTION_SCHOOL_SIGNUP_VERIFIED=true wajib/,
  );
  assert.doesNotThrow(() => validateVercelSupabaseTarget({
    VERCEL_ENV: 'production',
    VITE_SUPABASE_URL: productionUrl,
    VITE_SUPABASE_ANON_KEY: 'public-anon-key',
    VITE_TURNSTILE_SITE_KEY: 'public-turnstile-key',
    VITE_PUBLIC_DEMO_TRIAL_ENABLED: 'true',
    PRODUCTION_CAPTCHA_VERIFIED: 'true',
    PRODUCTION_DEMO_TRIAL_VERIFIED: 'true',
  }));
  assert.doesNotThrow(() => validateVercelSupabaseTarget({
    VERCEL_ENV: 'production',
    VITE_SUPABASE_URL: productionUrl,
    VITE_SUPABASE_ANON_KEY: 'public-anon-key',
    VITE_TURNSTILE_SITE_KEY: 'public-turnstile-key',
    VITE_PUBLIC_SCHOOL_SIGNUP_ENABLED: 'true',
    PRODUCTION_CAPTCHA_VERIFIED: 'true',
    PRODUCTION_SCHOOL_SIGNUP_VERIFIED: 'true',
  }));
});

test('Vercel deployment fails clearly when its Supabase URL is missing or invalid', () => {
  assert.throws(
    () => validateVercelSupabaseTarget({ VERCEL_ENV: 'preview' }),
    /VITE_SUPABASE_URL wajib diatur/,
  );
  assert.throws(
    () => validateVercelSupabaseTarget({
      VERCEL_ENV: 'preview',
      VITE_SUPABASE_URL: stagingUrl,
    }),
    /VITE_SUPABASE_ANON_KEY wajib diatur/,
  );
  assert.throws(
    () => validateVercelSupabaseTarget({
      VERCEL_ENV: 'production',
      VITE_SUPABASE_URL: 'not-a-url',
      VITE_SUPABASE_ANON_KEY: 'public-anon-key',
    }),
    /VITE_SUPABASE_URL tidak valid/,
  );
});

test('local and non-Vercel builds do not require a hosted Supabase target', () => {
  assert.doesNotThrow(() => validateVercelSupabaseTarget({}));
  assert.doesNotThrow(() => validateVercelSupabaseTarget({ VERCEL_ENV: 'development' }));
});

test('deployment command targets Preview by default and requires explicit Production selection', () => {
  assert.deepEqual(deploymentArguments('preview'), ['deploy', '--yes']);
  assert.deepEqual(deploymentArguments('production'), ['deploy', '--yes', '--prod']);
  assert.throws(() => deploymentArguments('development'), /preview atau production/);
});
