import { afterEach, describe, expect, it, vi } from 'vitest';

const rpc = vi.hoisted(() => vi.fn());
vi.mock('../lib/supabase.ts', () => ({ supabase: { rpc } }));

import { muatRingkasanKontenSekolah } from './schoolContentOverview.js';

describe('school content overview service', () => {
  afterEach(() => rpc.mockReset());

  it('accepts the complete fixed set of content aggregate metrics', async () => {
    rpc.mockResolvedValue({
      data: [
        { metric_key: 'classroom_materials_current', metric_value: 14 },
        { metric_key: 'classroom_materials_30d', metric_value: 4 },
        { metric_key: 'school_announcements_30d', metric_value: 2 },
      ],
      error: null,
    });
    await expect(muatRingkasanKontenSekolah()).resolves.toEqual({
      classroom_materials_current: { label: 'Materi ruang kelas tersimpan', value: 14 },
      classroom_materials_30d: { label: 'Materi ditambahkan · 30 hari', value: 4 },
      school_announcements_30d: { label: 'Pengumuman dibuat · 30 hari', value: 2 },
    });
    expect(rpc).toHaveBeenCalledWith('school_admin_content_overview');
  });

  it('rejects incomplete, duplicate, negative, and unsafe values', async () => {
    const valid = [
      { metric_key: 'classroom_materials_current', metric_value: 4 },
      { metric_key: 'classroom_materials_30d', metric_value: 1 },
      { metric_key: 'school_announcements_30d', metric_value: 2 },
    ];
    for (const data of [
      valid.slice(0, 2),
      [valid[0], valid[0], valid[2]],
      [valid[0], { ...valid[1], metric_value: Number.MAX_SAFE_INTEGER + 1 }, valid[2]],
    ]) {
      rpc.mockResolvedValueOnce({ data, error: null });
      await expect(muatRingkasanKontenSekolah())
        .rejects.toThrow('ringkasan konten sekolah yang tidak valid');
    }
  });

  it('surfaces RPC authorization failures', async () => {
    const serverError = new Error('permission denied');
    rpc.mockResolvedValue({ data: null, error: serverError });
    await expect(muatRingkasanKontenSekolah()).rejects.toBe(serverError);
  });
});
