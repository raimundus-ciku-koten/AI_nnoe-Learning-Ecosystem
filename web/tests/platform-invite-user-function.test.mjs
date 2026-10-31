import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { describe, it } from 'node:test';

const functionSource = readFileSync(
  new URL('../../supabase/functions/platform-invite-user/index.ts', import.meta.url),
  'utf8',
);

describe('platform user invitation edge function', () => {
  it('validates the caller and target allowlist before using Auth admin', () => {
    assert.match(functionSource, /supabase\.auth\.getUser\(token\)/);
    assert.match(functionSource, /actor\.active !== true \|\| actor\.role !== 'superadmin'/);
    assert.match(functionSource, /allowlist\.active !== true \|\| allowlist\.role === 'superadmin'/);
    assert.match(functionSource, /supabase\.auth\.admin\.inviteUserByEmail/);
    assert.match(functionSource, /Deno\.env\.get\('PLATFORM_APP_ORIGIN'\)/);
    assert.match(functionSource, /redirectUrl\.origin !== allowedOrigin/);
  });

  it('limits repeat invitations and records successful sends in the platform audit', () => {
    assert.match(functionSource, /platform\.user\.invited/);
    assert.match(functionSource, /Date\.now\(\) - 60_000/);
    assert.match(functionSource, /platform_audit/);
    assert.match(functionSource, /invitation_sent: true/);
  });
});
