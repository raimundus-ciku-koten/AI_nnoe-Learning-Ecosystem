import { defineConfig, loadEnv } from 'vite';
import { resolve } from 'node:path';

export function resolveViteEnvDirectory(mode, projectRoot = process.cwd()) {
  const directory = mode === 'development' || mode === 'staging'
    ? 'env/staging'
    : '.';
  return resolve(projectRoot, directory);
}

export function validateStagingSupabaseConfig(env) {
  const projectUrl = env.VITE_SUPABASE_URL?.trim();
  const anonKey = env.VITE_SUPABASE_ANON_KEY?.trim();

  if (!projectUrl || !anonKey) {
    throw new Error(
      'Staging mode requires VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY in the isolated Staging profile.',
    );
  }

  let parsedUrl;
  try {
    parsedUrl = new URL(projectUrl);
  } catch {
    throw new Error('Staging mode requires a valid Supabase project URL.');
  }

  if (
    parsedUrl.protocol !== 'https:' ||
    parsedUrl.hostname !== 'samszhfyhbjuculrcffg.supabase.co' ||
    parsedUrl.pathname !== '/' ||
    parsedUrl.search ||
    parsedUrl.hash
  ) {
    throw new Error('Staging mode must target the approved Staging Supabase project.');
  }
}

export function validateProductionSupabaseConfig(env) {
  const projectUrl = env.VITE_SUPABASE_URL?.trim();
  const anonKey = env.VITE_SUPABASE_ANON_KEY?.trim();

  if (!projectUrl || !anonKey) {
    throw new Error(
      'Production builds require VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY.',
    );
  }

  let parsedUrl;
  try {
    parsedUrl = new URL(projectUrl);
  } catch {
    throw new Error('Production builds require a valid Supabase project URL.');
  }

  if (
    parsedUrl.protocol !== 'https:' ||
    parsedUrl.hostname !== 'jvcrmzmuxgyuetkjqady.supabase.co' ||
    parsedUrl.pathname !== '/' ||
    parsedUrl.search ||
    parsedUrl.hash
  ) {
    throw new Error('Production builds must target the approved Production Supabase project.');
  }
}

export function validateDeploymentSupabaseConfig(
  env,
  { isVercel = Boolean(process.env.VERCEL), vercelEnv = process.env.VERCEL_ENV } = {},
) {
  if (isVercel) {
    if (vercelEnv === 'production') {
      validateProductionSupabaseConfig(env);
      return;
    }

    if (vercelEnv === 'preview') {
      validateStagingSupabaseConfig(env);
      return;
    }

    throw new Error('Vercel builds require VERCEL_ENV to be production or preview.');
  }

  if (env.ALLOW_LOCAL_PRODUCTION_BUILD === 'true') {
    validateProductionSupabaseConfig(env);
    return;
  }

  const projectUrl = env.VITE_SUPABASE_URL?.trim();
  if (!projectUrl) {
    throw new Error('Local production-mode builds require the Staging Supabase configuration.');
  }

  let projectHost = '';
  try {
    projectHost = new URL(projectUrl).hostname;
  } catch {
    throw new Error('Local production-mode builds require a valid Staging Supabase project URL.');
  }

  if (projectHost !== 'samszhfyhbjuculrcffg.supabase.co') {
    throw new Error(
      'Local production-mode builds require the Staging Supabase project. Use Vercel for Production builds.',
    );
  }
  validateStagingSupabaseConfig(env);
}

export default defineConfig(({ mode }) => {
  const envDir = resolveViteEnvDirectory(mode);
  const env = loadEnv(mode, envDir, '');
  if (mode === 'development' || mode === 'staging') {
    validateStagingSupabaseConfig(env);
  } else if (mode === 'production') {
    validateDeploymentSupabaseConfig(env);
  }

  return {
    envDir,
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
        onwarn(warning, warn) {
          const message = warning.message.replaceAll('\\', '/');
          if (
            warning.code === 'MODULE_LEVEL_DIRECTIVE' &&
            message.includes('Module level directives cause errors when bundled, "use client"') &&
            message.includes('in "node_modules/react-router/dist/') &&
            message.includes(' was ignored.')
          ) {
            return;
          }
          warn(warning);
        },
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
