import { beforeEach, describe, expect, it, vi } from 'vitest';

const { supabase } = vi.hoisted(() => ({ supabase: { from: vi.fn() } }));
vi.mock('../lib/supabase.ts', () => ({ supabase }));

import { readFileSync } from 'node:fs';
import {
    buatUnitSekolah,
    JENJANG_UNIT,
    muatUnitSekolah,
    ubahUnitSekolah,
} from './schoolUnits.js';

const MIGRATION = readFileSync(
    new URL('../../../supabase/migrations/20261030000400_school_units.sql', import.meta.url),
    'utf8',
);

function makeQuery(response) {
    const calls = [];
    const query = {
        calls,
        select: vi.fn((...args) => { calls.push(['select', ...args]); return query; }),
        insert: vi.fn((...args) => { calls.push(['insert', ...args]); return query; }),
        update: vi.fn((...args) => { calls.push(['update', ...args]); return query; }),
        eq: vi.fn((...args) => { calls.push(['eq', ...args]); return query; }),
        order: vi.fn((...args) => {
            calls.push(['order', ...args]);
            return args[0] === 'name' ? Promise.resolve(response) : query;
        }),
        single: vi.fn(() => Promise.resolve(response)),
        maybeSingle: vi.fn(() => Promise.resolve(response)),
    };
    return query;
}

describe('school unit service', () => {
    beforeEach(() => vi.clearAllMocks());

    it('loads units for one tenant and orders active units first', async () => {
        const rows = [{ id: 'unit-1', code: 'SMA', name: 'SMA Utama' }];
        const query = makeQuery({ data: rows, error: null });
        supabase.from.mockReturnValueOnce(query);

        await expect(muatUnitSekolah('tenant-1')).resolves.toEqual(rows);
        expect(supabase.from).toHaveBeenCalledWith('school_units');
        expect(query.calls).toContainEqual(['eq', 'tenant_id', 'tenant-1']);
        expect(query.calls).toContainEqual(['order', 'active', { ascending: false }]);
    });

    it('normalizes and records the actor when creating a unit', async () => {
        const row = { id: 'unit-1', tenant_id: 'tenant-1', code: 'SMA-UTAMA' };
        const query = makeQuery({ data: row, error: null });
        supabase.from.mockReturnValueOnce(query);

        await expect(buatUnitSekolah({
            tenantId: 'tenant-1',
            actorId: 'admin-1',
            unit: { code: ' sma-utama ', name: ' SMA Utama ', educationLevel: 'SMA' },
        })).resolves.toEqual(row);
        expect(query.calls).toContainEqual(['insert', {
            tenant_id: 'tenant-1',
            code: 'SMA-UTAMA',
            name: 'SMA Utama',
            education_level: 'sma',
            active: true,
            created_by: 'admin-1',
            updated_by: 'admin-1',
        }]);
    });

    it('updates only within the selected tenant and stamps the actor', async () => {
        const query = makeQuery({ data: { id: 'unit-1', active: false }, error: null });
        supabase.from.mockReturnValueOnce(query);

        await ubahUnitSekolah({
            tenantId: 'tenant-1',
            actorId: 'admin-1',
            unitId: 'unit-1',
            unit: { code: 'SMA-UTAMA', name: 'SMA Utama', educationLevel: 'sma', active: false },
        });
        expect(query.calls).toContainEqual(['eq', 'tenant_id', 'tenant-1']);
        expect(query.calls).toContainEqual(['eq', 'id', 'unit-1']);
        expect(query.calls).toContainEqual(['update', expect.objectContaining({
            active: false,
            updated_by: 'admin-1',
        })]);
    });

    it('rejects invalid tenant, actor, code, name, and level before making a request', async () => {
        await expect(muatUnitSekolah('')).rejects.toThrow('Tenant sekolah belum tersedia');
        await expect(buatUnitSekolah({
            tenantId: 'tenant-1', actorId: '', unit: {},
        })).rejects.toThrow('Identitas admin belum tersedia');
        await expect(buatUnitSekolah({
            tenantId: 'tenant-1', actorId: 'admin-1',
            unit: { code: 'invalid code', name: 'Nama', educationLevel: 'sma' },
        })).rejects.toThrow('Kode unit');
        await expect(buatUnitSekolah({
            tenantId: 'tenant-1', actorId: 'admin-1',
            unit: { code: 'SMA', name: 'Nama', educationLevel: 'unknown' },
        })).rejects.toThrow('Jenjang pendidikan tidak valid');
        expect(supabase.from).not.toHaveBeenCalled();
    });

    it('keeps tenant isolation and admin-only writes in the SQL contract', () => {
        expect(MIGRATION).toContain('alter table public.school_units enable row level security');
        expect(MIGRATION).toContain("public.current_app_role()) = 'admin_sekolah'");
        expect(MIGRATION).toContain('tenant_id = (select public.current_tenant_id())');
        expect(MIGRATION).toContain('created_by = (select auth.uid())');
        expect(MIGRATION).not.toMatch(/create policy[^;]+for delete/is);
        expect(JENJANG_UNIT.map(({ value }) => value)).toContain('smk');
    });
});