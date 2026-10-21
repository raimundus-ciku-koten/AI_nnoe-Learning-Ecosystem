import { beforeEach, describe, expect, it, vi } from 'vitest';

const { supabase } = vi.hoisted(() => ({ supabase: { from: vi.fn() } }));
vi.mock('../lib/supabase.ts', () => ({ supabase }));

import {
  muatPengaturanTenant,
  simpanProfilTenant,
  simpanSiklusTenant,
} from './tenantSettings.js';

function makeQuery(response) {
  const calls = [];
  const query = {
    calls,
    select: vi.fn((...args) => { calls.push(['select', ...args]); return query; }),
    eq: vi.fn((...args) => { calls.push(['eq', ...args]); return query; }),
    update: vi.fn((...args) => { calls.push(['update', ...args]); return query; }),
    maybeSingle: vi.fn(() => Promise.resolve(response)),
  };
  return query;
}

const row = {
  id: 'school-1',
  name: 'SMA Contoh',
  npsn: '12345678',
  headmaster_name: 'Kepala Sekolah',
  headmaster_nip: '123 456',
  academic_year: '2026/2027',
  semester: 'genap',
};

describe('Supabase tenant settings', () => {
  beforeEach(() => vi.clearAllMocks());

  it('loads and maps tenant profile and academic-cycle fields', async () => {
    const query = makeQuery({ data: row, error: null });
    supabase.from.mockReturnValueOnce(query);

    await expect(muatPengaturanTenant('school-1')).resolves.toEqual({
      tenantId: 'school-1',
      nama: 'SMA Contoh',
      npsn: '12345678',
      kepalaSekolah: 'Kepala Sekolah',
      nipKepalaSekolah: '123 456',
      tahunAjaran: '2026/2027',
      semester: 'Genap',
    });
    expect(supabase.from).toHaveBeenCalledWith('tenants');
    expect(query.eq).toHaveBeenCalledWith('id', 'school-1');
  });

  it('updates only editable profile fields and attaches the current actor', async () => {
    const query = makeQuery({ data: row, error: null });
    supabase.from.mockReturnValueOnce(query);

    await simpanProfilTenant('school-1', 'user-1', {
      nama: ' SMA Contoh ',
      npsn: '12345678',
      kepalaSekolah: 'Kepala Sekolah',
      nipKepalaSekolah: '123 456',
    });

    expect(query.update).toHaveBeenCalledWith({
      name: 'SMA Contoh',
      npsn: '12345678',
      headmaster_name: 'Kepala Sekolah',
      headmaster_nip: '123 456',
      updated_by: 'user-1',
    });
  });

  it('normalizes the academic cycle to the database enum values', async () => {
    const query = makeQuery({ data: row, error: null });
    supabase.from.mockReturnValueOnce(query);

    await simpanSiklusTenant('school-1', 'user-1', {
      tahunAjaran: '2026/2027',
      semester: 'Genap',
    });

    expect(query.update).toHaveBeenCalledWith({
      academic_year: '2026/2027',
      semester: 'genap',
      updated_by: 'user-1',
    });
  });

  it('rejects malformed cycles and missing tenant results instead of reporting success', async () => {
    await expect(simpanSiklusTenant('school-1', 'user-1', {
      tahunAjaran: '2026/2028',
      semester: 'Ganjil',
    })).rejects.toThrow('Format tahun ajaran');

    supabase.from.mockReturnValueOnce(makeQuery({ data: null, error: null }));
    await expect(muatPengaturanTenant('school-1')).rejects.toThrow('Data sekolah tidak ditemukan');
  });
});
