import { beforeEach, describe, expect, it, vi } from 'vitest';

const { supabase } = vi.hoisted(() => ({ supabase: { from: vi.fn() } }));
vi.mock('../lib/supabase.ts', () => ({ supabase }));

import {
    buatPengumumanSekolah,
    hapusPengumumanSekolah,
    muatPengumumanSekolah,
    ubahPengumumanSekolah,
} from './schoolAnnouncements.js';

function makeQuery(response) {
    const calls = [];
    const query = {
        calls,
        select: vi.fn((...args) => { calls.push(['select', ...args]); return query; }),
        insert: vi.fn((...args) => { calls.push(['insert', ...args]); return query; }),
        update: vi.fn((...args) => { calls.push(['update', ...args]); return query; }),
        delete: vi.fn(() => { calls.push(['delete']); return query; }),
        eq: vi.fn((...args) => { calls.push(['eq', ...args]); return query; }),
        order: vi.fn((...args) => { calls.push(['order', ...args]); return query; }),
        limit: vi.fn((...args) => { calls.push(['limit', ...args]); return Promise.resolve(response); }),
        single: vi.fn(() => Promise.resolve(response)),
        maybeSingle: vi.fn(() => Promise.resolve(response)),
    };
    return query;
}

describe('school announcement service', () => {
    beforeEach(() => vi.clearAllMocks());

    it('loads the latest announcements for one tenant only', async () => {
        const rows = [{ id: 'notice-1', title: 'Rapat', body: 'Senin' }];
        const query = makeQuery({ data: rows, error: null });
        supabase.from.mockReturnValueOnce(query);

        await expect(muatPengumumanSekolah('tenant-1')).resolves.toEqual(rows);
        expect(supabase.from).toHaveBeenCalledWith('school_announcements');
        expect(query.calls).toContainEqual(['eq', 'tenant_id', 'tenant-1']);
        expect(query.calls).toContainEqual(['order', 'created_at', { ascending: false }]);
        expect(query.calls).toContainEqual(['limit', 100]);
    });

    it('creates bounded announcements under the current tenant and author', async () => {
        const result = { id: 'notice-1', title: 'Rapat', body: 'Senin' };
        const query = makeQuery({ data: result, error: null });
        supabase.from.mockReturnValueOnce(query);

        await expect(buatPengumumanSekolah({
            tenantId: 'tenant-1',
            authorId: 'admin-1',
            title: '  Rapat  ',
            body: '  Senin  ',
        })).resolves.toEqual(result);
        expect(query.calls).toContainEqual(['insert', {
            tenant_id: 'tenant-1',
            author_id: 'admin-1',
            title: 'Rapat',
            body: 'Senin',
        }]);
    });

    it('updates and deletes only an announcement in the selected tenant', async () => {
        const updateQuery = makeQuery({ data: { id: 'notice-1' }, error: null });
        const deleteQuery = makeQuery({ data: { id: 'notice-1' }, error: null });
        supabase.from.mockReturnValueOnce(updateQuery).mockReturnValueOnce(deleteQuery);

        await ubahPengumumanSekolah({
            tenantId: 'tenant-1', announcementId: 'notice-1', title: 'Baru', body: 'Isi',
        });
        await hapusPengumumanSekolah({ tenantId: 'tenant-1', announcementId: 'notice-1' });
        expect(updateQuery.calls).toContainEqual(['eq', 'tenant_id', 'tenant-1']);
        expect(updateQuery.calls).toContainEqual(['eq', 'id', 'notice-1']);
        expect(deleteQuery.calls).toContainEqual(['eq', 'tenant_id', 'tenant-1']);
        expect(deleteQuery.calls).toContainEqual(['eq', 'id', 'notice-1']);
    });

    it('rejects invalid tenant or content before a request is made', async () => {
        await expect(muatPengumumanSekolah('')).rejects.toThrow('Tenant sekolah belum tersedia');
        await expect(buatPengumumanSekolah({
            tenantId: 'tenant-1', authorId: 'admin-1', title: ' ', body: 'Isi',
        })).rejects.toThrow('Judul wajib diisi');
        await expect(buatPengumumanSekolah({
            tenantId: 'tenant-1', authorId: 'admin-1', title: 'Judul', body: 'x'.repeat(5001),
        })).rejects.toThrow('Isi pengumuman wajib diisi');
        expect(supabase.from).not.toHaveBeenCalled();
    });
});