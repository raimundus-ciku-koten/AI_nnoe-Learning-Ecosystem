import { beforeEach, describe, expect, it, vi } from 'vitest';

const invokeMock = vi.hoisted(() => vi.fn());
vi.mock('../lib/supabase.ts', () => ({
  supabase: {
    functions: { invoke: invokeMock },
    rpc: vi.fn(),
  },
}));

import { ajukanSekolah } from './schoolRegistration.js';

describe('school registration submission', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('submits through the authenticated registry Edge Function', async () => {
    invokeMock.mockResolvedValue({
      data: { requestId: 'request-id', status: 'pending', verified: true },
      error: null,
    });
    const input = {
      npsn: '12345678',
      name: 'SMA Contoh',
      educationLevel: 'SMA',
      province: 'Nusa Tenggara Timur',
      city: 'Flores Timur',
      address: 'Jalan Contoh',
    };

    await expect(ajukanSekolah(input)).resolves.toBe('request-id');
    expect(invokeMock).toHaveBeenCalledWith('school-registry', { body: input });
  });

  it('surfaces a safe error from the registry function', async () => {
    invokeMock.mockResolvedValue({
      data: null,
      error: {
        message: 'Edge Function returned a non-2xx status code',
        context: new Response(JSON.stringify({ error: 'Akun terverifikasi diperlukan.' }), {
          status: 401,
          headers: { 'content-type': 'application/json' },
        }),
      },
    });

    await expect(ajukanSekolah({ npsn: '12345678' }))
      .rejects.toThrow('Akun terverifikasi diperlukan.');
  });

  it('rejects a successful response without a request ID', async () => {
    invokeMock.mockResolvedValue({ data: { status: 'pending' }, error: null });

    await expect(ajukanSekolah({ npsn: '12345678' }))
      .rejects.toThrow('Server tidak mengembalikan ID permohonan yang valid.');
  });

  it('does not call an RPC directly from the browser', async () => {
    invokeMock.mockResolvedValue({ data: { requestId: 'request-id' }, error: null });
    const { supabase } = await import('../lib/supabase.ts');

    await ajukanSekolah({ npsn: '12345678' });
    expect(supabase.rpc).not.toHaveBeenCalled();
  });
});
