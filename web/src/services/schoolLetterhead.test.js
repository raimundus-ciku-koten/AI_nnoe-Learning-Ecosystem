import { beforeEach, describe, expect, it, vi } from 'vitest';

const { supabase } = vi.hoisted(() => ({ supabase: { from: vi.fn() } }));
vi.mock('../lib/supabase.ts', () => ({ supabase }));

import { hapusKopSekolah, muatKopSekolah, simpanKopSekolah } from './schoolLetterhead.js';

function query(response = { data: null, error: null }) {
  const result = {
    eq: vi.fn(() => result),
    maybeSingle: vi.fn(() => Promise.resolve(response)),
    upsert: vi.fn(() => result),
    select: vi.fn(() => result),
    single: vi.fn(() => Promise.resolve(response)),
    delete: vi.fn(() => result),
    then(resolve, reject) { return Promise.resolve(response).then(resolve, reject); },
  };
  return result;
}

describe('school letterhead service', () => {
  beforeEach(() => vi.clearAllMocks());

  it('loads only the active tenant letterhead and returns an empty value when none exists', async () => {
    const builder = query({ data: null, error: null });
    supabase.from.mockReturnValueOnce(builder);
    await expect(muatKopSekolah('school-1')).resolves.toBe('');
    expect(supabase.from).toHaveBeenCalledWith('school_letterheads');
    expect(builder.eq).toHaveBeenCalledWith('tenant_id', 'school-1');
  });

  it('upserts a bounded image data URL for the selected school and actor', async () => {
    const image = `data:image/webp;base64,${'A'.repeat(32)}`;
    const builder = query({ data: { tenant_id: 'school-1', image_data_url: image }, error: null });
    supabase.from.mockReturnValueOnce(builder);
    await expect(simpanKopSekolah('school-1', 'user-1', image)).resolves.toBe(image);
    expect(builder.upsert).toHaveBeenCalledWith({
      tenant_id: 'school-1',
      image_data_url: image,
      updated_by: 'user-1',
    }, { onConflict: 'tenant_id' });
  });

  it('rejects unsafe image formats and reports database errors', async () => {
    await expect(simpanKopSekolah('school-1', 'user-1', 'data:text/html;base64,PHNjcmlwdD4='))
      .rejects.toThrow('Gambar kop sekolah tidak valid');
    const builder = query({ data: null, error: new Error('permission denied') });
    supabase.from.mockReturnValueOnce(builder);
    await expect(muatKopSekolah('school-1')).rejects.toThrow('permission denied');
  });

  it('deletes only the selected tenant letterhead', async () => {
    const builder = query();
    supabase.from.mockReturnValueOnce(builder);
    await hapusKopSekolah('school-1');
    expect(builder.eq).toHaveBeenCalledWith('tenant_id', 'school-1');
  });
});
