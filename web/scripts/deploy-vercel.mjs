import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { validateVercelSupabaseTarget } from '../vite.config.js';

const allowedEnvs = new Set(['preview', 'production']);
const envName = (process.argv[2] || process.env.VERCEL_ENV || 'preview').toLowerCase();
const webRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');

export function deploymentArguments(target) {
  if (!allowedEnvs.has(target)) {
    throw new Error('Target deployment harus preview atau production.');
  }

  return target === 'production' ? ['deploy', '--yes', '--prod'] : ['deploy', '--yes'];
}

function verifyLinkedProject() {
  const projectConfigPath = resolve(webRoot, '.vercel', 'project.json');
  let projectConfigContent;
  let projectConfig;

  try {
    projectConfigContent = readFileSync(projectConfigPath, 'utf8');
  } catch (error) {
    if (error.code === 'ENOENT') {
      throw new Error(
        'Project Vercel belum terhubung. Jalankan `vercel link` dari folder web, lalu ulangi deploy.',
      );
    }
    throw new Error(`Konfigurasi Vercel tidak dapat dibaca: ${error.message}`);
  }

  try {
    projectConfig = JSON.parse(projectConfigContent);
  } catch (error) {
    throw new Error(`Konfigurasi .vercel/project.json bukan JSON valid: ${error.message}`);
  }

  if (!projectConfig.orgId || !projectConfig.projectId) {
    throw new Error('Konfigurasi .vercel/project.json tidak memiliki orgId/projectId yang valid.');
  }
}

function verifyLocalEnvironmentIfProvided(target) {
  const hasLocalVercelEnvironment = [
    'VITE_SUPABASE_URL',
    'VITE_SUPABASE_ANON_KEY',
    'VITE_TURNSTILE_SITE_KEY',
    'VITE_PUBLIC_DEMO_TRIAL_ENABLED',
    'VITE_PUBLIC_SCHOOL_SIGNUP_ENABLED',
    'STAGING_PUBLIC_SIGNUP_VERIFIED',
  ].some((key) => process.env[key] !== undefined);

  if (hasLocalVercelEnvironment) {
    validateVercelSupabaseTarget({ ...process.env, VERCEL_ENV: target });
  }
}

function deploy() {
  let args;
  try {
    args = deploymentArguments(envName);
    verifyLinkedProject();
    verifyLocalEnvironmentIfProvided(envName);
  } catch (error) {
    console.error(`Deployment gate failed for ${envName}.`);
    console.error(error.message);
    process.exitCode = 1;
    return;
  }

  console.log(`Starting Vercel ${envName} deployment from ${webRoot}.`);
  console.log('Vercel build runs the authoritative Supabase target and public-signup gates.');

  const result = spawnSync('vercel', args, {
    cwd: webRoot,
    stdio: 'inherit',
    shell: process.platform === 'win32',
  });

  if (result.error) {
    console.error(`Vercel deployment could not start: ${result.error.message}`);
    console.error('Install and authenticate the Vercel CLI, then retry.');
    process.exitCode = 1;
    return;
  }

  if (result.status !== 0) {
    process.exitCode = result.status ?? 1;
  }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  deploy();
}
