import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { test } from 'node:test';

const root = new URL('../../', import.meta.url);
const read = (path) => readFileSync(new URL(path, root), 'utf8');

test('public signup is removed while account login and recovery remain', () => {
  const auth = read('web/src/auth.js');
  const login = read('web/src/pages/login.js');
  const supabaseConfig = read('supabase/config.toml');
  assert.doesNotMatch(auth, /auth\.signUp\s*\(/);
  assert.doesNotMatch(auth, /daftarUjiCoba/);
  assert.doesNotMatch(login, /formTrial|trialPrompt|btnDaftarTrial|daftarUjiCoba|VITE_PUBLIC_DEMO_TRIAL_ENABLED/);
  assert.match(supabaseConfig, /\[auth\]\s+enable_signup\s*=\s*false/);
  assert.match(login, /signInWithPassword|login\(/);
  assert.match(login, /resetPassword/);
});

test('demo trial pages and routes are absent while unsupported roles stay denied', () => {
  const app = read('web/src/App.jsx');
  assert.equal(existsSync(new URL('web/src/pages/TrialDemoPage.jsx', root)), false);
  assert.equal(existsSync(new URL('web/src/styles/trial-demo.css', root)), false);
  assert.doesNotMatch(app, /TrialDemoPage|HalamanTrial/);
  assert.doesNotMatch(app, /path="\/trial"/);
  const roleAccess = read('web/src/services/roleAccess.js');
  assert.doesNotMatch(roleAccess, /role === 'demo'/);
  assert.match(roleAccess, /return false/);
});

test('public purchase, Midtrans, and advertising integrations are absent from active source', () => {
  const config = read('supabase/config.toml');
  const legacyFunctions = read('functions/index.js');
  assert.equal(existsSync(new URL('web/src/pages/PurchasePage.jsx', root)), false);
  assert.equal(existsSync(new URL('supabase/functions/midtrans-checkout/index.ts', root)), false);
  assert.equal(existsSync(new URL('supabase/functions/midtrans-webhook/index.ts', root)), false);
  assert.equal(existsSync(new URL('web/src/components/AdSenseBanner.jsx', root)), false);
  assert.equal(existsSync(new URL('web/public/ads.txt', root)), false);
  assert.doesNotMatch(config, /midtrans-(?:checkout|webhook)/i);
  assert.doesNotMatch(legacyFunctions, /midtrans|MIDTRANS_SERVER_KEY/i);
});

test('historical database migrations remain untouched and are not registered as active checkout functions', () => {
  assert.equal(existsSync(new URL('supabase/migrations/20261018000400_midtrans_billing.sql', root)), true);
  assert.equal(existsSync(new URL('supabase/migrations/20261019000200_public_demo_trial.sql', root)), true);
  assert.doesNotMatch(read('supabase/config.toml'), /midtrans/);
});
