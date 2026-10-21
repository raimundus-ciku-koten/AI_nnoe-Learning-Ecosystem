import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const migration = await readFile(new URL(
  '../../supabase/migrations/20261020000200_learning_materials.sql',
  import.meta.url,
), 'utf8');
const registration = await readFile(new URL(
  '../../supabase/migrations/20261020000300_school_registration_approval.sql',
  import.meta.url,
), 'utf8');
const registrationService = await readFile(new URL(
  '../src/services/schoolRegistration.js',
  import.meta.url,
), 'utf8');
const registrationAdminPage = await readFile(new URL(
  '../src/pages/PlatformTenantsPage.jsx',
  import.meta.url,
), 'utf8');
const schoolRegistryFunction = await readFile(new URL(
  '../../supabase/functions/school-registry/index.ts',
  import.meta.url,
), 'utf8');
const materialsPage = await readFile(new URL('../src/pages/LearningMaterialsPage.jsx', import.meta.url), 'utf8');

test('keeps shared documents private and restricted to active members of the same tenant', () => {
  assert.match(migration, /create table if not exists public\.learning_materials/);
  assert.match(migration, /mime_type in \([\s\S]*'application\/pdf'[\s\S]*openxmlformats-officedocument\.wordprocessingml\.document/);
  assert.match(migration, /tenant_id = \(select public\.current_tenant_id\(\)\)/);
  assert.match(migration, /public\.current_user_is_active\(\)/);
  assert.match(migration, /public\.current_app_role\(\)\) = 'guru'/);
  assert.match(migration, /public\.learning_materials material/);
  assert.match(migration, /public = false/);
  assert.match(materialsPage, /Baca seperti flipbook/);
  assert.match(materialsPage, /renderDocx/);
});

test('holds new NPSN requests until a superadmin reviews a matching registry snapshot', () => {
  assert.match(registration, /create table if not exists public\.school_registration_requests_v2/);
  assert.doesNotMatch(registration, /public\.school_registration_requests(?!_v2)/);
  assert.match(registration, /npsn ~ '\^\[0-9\]\{8\}\$'/);
  assert.match(registration, /status text not null default 'pending'/);
  assert.match(registration, /alter table public\.school_registration_requests_v2 enable row level security/);
  assert.match(registration, /revoke all on table public\.school_registration_requests_v2 from public, anon, authenticated/);
  assert.match(registration, /grant select on table public\.school_registration_requests_v2 to authenticated/);
  assert.match(registration, /grant all on table public\.school_registration_requests_v2 to service_role/);
  assert.match(registration, /submit_school_registration_request_v2/);
  assert.match(registration, /review_school_registration_request_v2/);
  assert.match(registration, /public\.current_app_role\(\) <> 'superadmin'/);
  assert.match(registration, /p_registry_data ->> 'npsn'/);
  assert.match(registration, /ministry_registry_data/);
  assert.match(registration, /public\.manage_platform_user/);
  assert.match(registrationService, /school_registration_requests_v2/);
  assert.match(registrationService, /functions\.invoke\('school-registry'/);
  assert.doesNotMatch(registrationService, /rpc\('submit_school_registration_request_v2'/);
  assert.match(registrationService, /review_school_registration_request_v2/);
  assert.match(registrationAdminPage, /school_registration_requests_v2/);
  assert.match(schoolRegistryFunction, /submit_school_registration_request_v2/);
  assert.match(schoolRegistryFunction, /auth\.getUser\(token\)/);
});
