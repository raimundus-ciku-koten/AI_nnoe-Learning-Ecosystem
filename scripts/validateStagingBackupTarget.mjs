const STAGING_PROJECT_REF = 'samszhfyhbjuculrcffg';
const STAGING_POOLER_HOST = /^aws-\d+-ap-south-1\.pooler\.supabase\.com$/;

export function validateStagingBackupTarget(connectionString) {
  let target;
  try {
    target = new URL(connectionString);
  } catch {
    throw new Error('SUPABASE_DB_URL is not a valid PostgreSQL URL.');
  }

  let username;
  try {
    username = decodeURIComponent(target.username);
  } catch {
    throw new Error('SUPABASE_DB_URL contains an invalid database username.');
  }

  const directStaging = target.hostname === `db.${STAGING_PROJECT_REF}.supabase.co`
    && username === 'postgres';
  const sessionPoolerStaging = STAGING_POOLER_HOST.test(target.hostname)
    && username === `postgres.${STAGING_PROJECT_REF}`;
  if (!['postgres:', 'postgresql:'].includes(target.protocol)
      || (!directStaging && !sessionPoolerStaging)
      || !target.password) {
    throw new Error('SUPABASE_DB_URL must target the configured Staging database only.');
  }
}

if (import.meta.url === new URL(process.argv[1] || '', 'file:').href) {
  try {
    validateStagingBackupTarget(process.env.SUPABASE_DB_URL || '');
  } catch (error) {
    console.error(`[staging-backup] ${error.message}`);
    process.exitCode = 1;
  }
}
