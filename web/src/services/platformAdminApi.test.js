import { beforeEach, describe, expect, it, vi } from 'vitest';

const rpc = vi.hoisted(() => vi.fn());
vi.mock('../lib/supabase.ts', () => ({ supabase: { rpc } }));

import { createPlatformTenant, provisionPlatformSuperadmin } from './platformAdminApi.js';

describe('platform administration RPC adapters', () => {
  beforeEach(() => rpc.mockReset());

  it('creates tenants only through the protected database RPC', async () => {
    rpc.mockResolvedValue({
      data: { id: 'tenant-123', name: 'SMP Contoh' },
      error: null,
    });

    await expect(createPlatformTenant('  SMP Contoh  ')).resolves.toEqual({
      id: 'tenant-123',
      name: 'SMP Contoh',
    });
    expect(rpc).toHaveBeenCalledWith('create_platform_tenant', { p_name: 'SMP Contoh' });
  });

  it('validates tenant names and rejects malformed RPC responses', async () => {
    await expect(createPlatformTenant(' ')).rejects.toThrow('2 sampai 160 karakter');
    expect(rpc).not.toHaveBeenCalled();

    rpc.mockResolvedValue({ data: { id: 123, name: 'SMP Contoh' }, error: null });
    await expect(createPlatformTenant('SMP Contoh')).rejects.toThrow('Respons pembuatan tenant tidak valid');
  });

  it('provisions a Super Admin through a separate protected RPC', async () => {
    rpc.mockResolvedValue({
      data: { email: 'admin@example.sch.id', role: 'superadmin', invitation_required: true },
      error: null,
    });

    await expect(provisionPlatformSuperadmin({
      email: ' Admin@Example.sch.id ',
      nama: 'Admin Platform',
    })).resolves.toMatchObject({ role: 'superadmin' });
    expect(rpc).toHaveBeenCalledWith('provision_platform_superadmin', {
      p_email: 'admin@example.sch.id',
      p_nama: 'Admin Platform',
    });
  });

  it('rejects invalid Super Admin inputs and malformed RPC responses', async () => {
    await expect(provisionPlatformSuperadmin({ email: 'not-an-email', nama: 'Admin' }))
      .rejects.toThrow('Alamat email Super Admin tidak valid');
    expect(rpc).not.toHaveBeenCalled();

    rpc.mockResolvedValue({ data: { email: 'admin@example.sch.id', role: 'guru' }, error: null });
    await expect(provisionPlatformSuperadmin({
      email: 'admin@example.sch.id',
      nama: 'Admin Platform',
    })).rejects.toThrow('Respons provisioning Super Admin tidak valid');
  });
});
