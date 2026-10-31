import { beforeEach, describe, expect, it, vi } from 'vitest';

const { supabase } = vi.hoisted(() => ({ supabase: { from: vi.fn() } }));
vi.mock('../lib/supabase.ts', () => ({ supabase }));

import {
  muatPengaturanTenant,
  simpanKopSuratTenant,
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
  address: 'Jalan Contoh 1',
  letterhead_object_path: 'school-1/letterhead',
};

describe('Supabase tenant settings', () => {
  beforeEach(() => vi.resetAllMocks());

  it('loads and maps tenant profile and academic-cycle fields', async () => {
    const query = makeQuery({ data: row, error: null });
    supabase.from.mockReturnValueOnce(query);

    await expect(muatPengaturanTenant('school-1')).resolves.toEqual({
      tenantId: 'school-1',
      nama: 'SMA Contoh',
      npsn: '12345678',
      kepalaSekolah: 'Kepala Sekolah',
      nipKepalaSekolah: '123 456',
      alamat: ' Jalan Contoh 1 ',
      tahunAjaran: '2026/2027',
      semester: 'Genap',
      alamat: 'Jalan Contoh 1',
      kopSuratPath: 'school-1/letterhead',
      kopSuratTersedia: true,
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
      alamat: ' Jalan Contoh 1 ',
    });

    expect(query.update).toHaveBeenCalledWith({
      name: 'SMA Contoh',
      npsn: '12345678',
      headmaster_name: 'Kepala Sekolah',
      headmaster_nip: '123 456',
      address: 'Jalan Contoh 1',
      updated_by: 'user-1',
    });
  });

  it('updates address and supports a tenant-scoped letterhead object path', async () => {
    const query = makeQuery({ data: row, error: null });
    supabase.from.mockReturnValueOnce(query);

    await simpanProfilTenant('school-1', 'user-1', {
      nama: 'SMA Contoh',
      alamat: 'Jalan Contoh 1',
    });
    expect(query.update).toHaveBeenCalledWith(expect.objectContaining({
      address: 'Jalan Contoh 1',
      updated_by: 'user-1',
    }));

    const letterheadQuery = makeQuery({ data: row, error: null });
    supabase.from.mockReturnValueOnce(letterheadQuery);
    await simpanKopSuratTenant('school-1', 'user-1', 'school-1/letterhead');
    expect(letterheadQuery.update).toHaveBeenCalledWith({
      letterhead_object_path: 'school-1/letterhead',
      updated_by: 'user-1',
    });
  });

  it('rejects a letterhead object path that belongs to another tenant', async () => {
    await expect(simpanKopSuratTenant('school-1', 'user-1', 'school-2/letterhead'))
      .rejects.toThrow('Lokasi kop surat tidak valid');
    expect(supabase.from).not.toHaveBeenCalled();
  });

  it('falls back to the existing profile schema until letterhead migration is present', async () => {
    const missingColumn = makeQuery({
      data: null,
      error: { code: '42703', message: 'column tenants.address does not exist' },
    });
    const legacy = { ...row };
    delete legacy.address;
    delete legacy.letterhead_object_path;
    const baseQuery = makeQuery({ data: legacy, error: null });
    supabase.from.mockReturnValueOnce(missingColumn).mockReturnValueOnce(baseQuery);

    await expect(muatPengaturanTenant('school-1')).resolves.toEqual(expect.objectContaining({
      nama: 'SMA Contoh',
      alamat: '',
      kopSuratPath: '',
      kopSuratTersedia: false,
    }));
    expect(supabase.from).toHaveBeenCalledTimes(2);
  });

  it('keeps existing school profile edits working when address columns are not deployed', async () => {
    const missingColumn = makeQuery({
      data: null,
      error: { code: '42703', message: 'column tenants.address does not exist' },
    });
    const legacy = { ...row };
    delete legacy.address;
    delete legacy.letterhead_object_path;
    const baseQuery = makeQuery({ data: legacy, error: null });
    supabase.from.mockReturnValueOnce(missingColumn).mockReturnValueOnce(baseQuery);

    await expect(simpanProfilTenant('school-1', 'user-1', {
      nama: 'SMA Contoh',
      alamat: 'Jalan Contoh 1',
    })).resolves.toMatchObject({ kopSuratTersedia: false, alamat: '' });
    expect(baseQuery.update).toHaveBeenCalledWith(expect.not.objectContaining({ address: expect.anything() }));
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
