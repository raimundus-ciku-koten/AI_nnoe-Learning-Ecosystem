import assert from 'node:assert/strict';
import test from 'node:test';
import {
  resolveViteEnvDirectory,
  validateDeploymentSupabaseConfig,
  validateStagingSupabaseConfig,
} from '../vite.config.js';
import { resolve } from 'node:path';

const stagingKey = 'staging-anon-key';

test('loads development and Staging environment files from the isolated profile', () => {
  const projectRoot = 'C:\\workspace\\web';
  assert.equal(
    resolveViteEnvDirectory('development', projectRoot),
    resolve(projectRoot, 'env', 'staging'),
  );
  assert.equal(
    resolveViteEnvDirectory('staging', projectRoot),
    resolve(projectRoot, 'env', 'staging'),
  );
});

test('loads production environment files from the web project root', () => {
  const projectRoot = 'C:\\workspace\\web';
  assert.equal(resolveViteEnvDirectory('production', projectRoot), resolve(projectRoot));
});

test('accepts a complete configuration for the approved Staging project', () => {
  assert.doesNotThrow(() => validateStagingSupabaseConfig({
    VITE_SUPABASE_URL: 'https://samszhfyhbjuculrcffg.supabase.co',
    VITE_SUPABASE_ANON_KEY: stagingKey,
  }));
});

test('rejects missing Staging credentials without printing their values', () => {
  assert.throws(
    () => validateStagingSupabaseConfig({
      VITE_SUPABASE_URL: 'https://samszhfyhbjuculrcffg.supabase.co',
    }),
    /requires VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY/,
  );
});

test('rejects Production and unrelated project URLs in Staging mode', () => {
  for (const url of [
    'https://jvcrmzmuxgyuetkjqady.supabase.co',
    'https://other-project.supabase.co',
    'http://samszhfyhbjuculrcffg.supabase.co',
  ]) {
    assert.throws(
      () => validateStagingSupabaseConfig({
        VITE_SUPABASE_URL: url,
        VITE_SUPABASE_ANON_KEY: stagingKey,
      }),
      /must target the approved Staging Supabase project/,
    );
  }
});

test('rejects malformed URLs and URLs containing a path or query', () => {
  for (const url of [
    'not-a-url',
    'https://samszhfyhbjuculrcffg.supabase.co/other',
    'https://samszhfyhbjuculrcffg.supabase.co?project=other',
  ]) {
    assert.throws(
      () => validateStagingSupabaseConfig({
        VITE_SUPABASE_URL: url,
        VITE_SUPABASE_ANON_KEY: stagingKey,
      }),
    );
  }
});

test('allows Vercel Production only with the approved Production project', () => {
  const productionEnv = {
    VITE_SUPABASE_URL: 'https://jvcrmzmuxgyuetkjqady.supabase.co',
    VITE_SUPABASE_ANON_KEY: 'production-anon-key',
  };
  assert.doesNotThrow(() => validateDeploymentSupabaseConfig(productionEnv, {
    isVercel: true,
    vercelEnv: 'production',
  }));
  assert.throws(() => validateDeploymentSupabaseConfig({
    ...productionEnv,
    VITE_SUPABASE_URL: 'https://samszhfyhbjuculrcffg.supabase.co',
  }, {
    isVercel: true,
    vercelEnv: 'production',
  }), /must target the approved Production Supabase project/);
});

test('Vercel Preview is restricted to the approved Staging project', () => {
  const stagingEnv = {
    VITE_SUPABASE_URL: 'https://samszhfyhbjuculrcffg.supabase.co',
    VITE_SUPABASE_ANON_KEY: 'staging-anon-key',
  };
  assert.doesNotThrow(() => validateDeploymentSupabaseConfig(stagingEnv, {
    isVercel: true,
    vercelEnv: 'preview',
  }));
  assert.throws(() => validateDeploymentSupabaseConfig({
    ...stagingEnv,
    VITE_SUPABASE_URL: 'https://jvcrmzmuxgyuetkjqady.supabase.co',
  }, {
    isVercel: true,
    vercelEnv: 'preview',
  }), /must target the approved Staging Supabase project/);
});

test('requires explicit opt-in and Production config for local Production builds', () => {
  const productionEnv = {
    VITE_SUPABASE_URL: 'https://jvcrmzmuxgyuetkjqady.supabase.co',
    VITE_SUPABASE_ANON_KEY: 'production-anon-key',
  };
  assert.throws(() => validateDeploymentSupabaseConfig(productionEnv, {
    isVercel: false,
  }), /Local production-mode builds require the Staging Supabase project/);
  assert.doesNotThrow(() => validateDeploymentSupabaseConfig({
    ...productionEnv,
    ALLOW_LOCAL_PRODUCTION_BUILD: 'true',
  }, { isVercel: false }));
});

test('rejects unknown Vercel environments', () => {
  assert.throws(() => validateDeploymentSupabaseConfig({}, {
    isVercel: true,
    vercelEnv: 'development',
  }), /require VERCEL_ENV to be production or preview/);
});
