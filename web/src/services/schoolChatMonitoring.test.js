import { beforeEach, describe, expect, it, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const { supabase } = vi.hoisted(() => ({ supabase: { rpc: vi.fn() } }));
vi.mock('../lib/supabase.ts', () => ({ supabase }));

import { muatRingkasanChatSekolah } from './schoolChatMonitoring.js';

const migration = readFileSync(fileURLToPath(new URL(
    '../../../supabase/migrations/20261030000700_school_chat_analytics.sql',
    import.meta.url,
)), 'utf8');

describe('school chat monitoring', () => {
    beforeEach(() => vi.clearAllMocks());

    it('loads aggregate counts from the tenant-scoped RPC only', async () => {
        supabase.rpc.mockResolvedValueOnce({
            data: [{
                conversation_count: 7,
                active_conversations_30d: 3,
                messages_7d: 22,
                messages_30d: 91,
            }], error: null
        });
        await expect(muatRingkasanChatSekolah()).resolves.toEqual({
            conversation_count: 7,
            active_conversations_30d: 3,
            messages_7d: 22,
            messages_30d: 91,
        });
        expect(supabase.rpc).toHaveBeenCalledWith('school_admin_chat_overview');
    });

    it('rejects empty, negative, malformed, or content-bearing results', async () => {
        for (const data of [[], [{ messages_7d: -1 }], [{
            conversation_count: 1, active_conversations_30d: 1, messages_7d: 2,
            messages_30d: 3, message_body: 'private',
        }]]) {
            supabase.rpc.mockResolvedValueOnce({ data, error: null });
            await expect(muatRingkasanChatSekolah()).rejects.toThrow('tidak valid');
        }
    });

    it('surfaces backend authorization or schema errors', async () => {
        supabase.rpc.mockResolvedValueOnce({ data: null, error: new Error('denied') });
        await expect(muatRingkasanChatSekolah()).rejects.toThrow('denied');
    });

    it('limits the RPC to active same-tenant admins and aggregate fields', () => {
        expect(migration).toContain("public.current_app_role()) <> 'admin_sekolah'");
        expect(migration).toContain('profile.tenant_id is distinct from (select public.current_tenant_id())');
        expect(migration).toContain('revoke all on function public.school_admin_chat_overview() from public, anon');
        expect(migration).toMatch(/returns table\s*\(\s*conversation_count bigint,\s*active_conversations_30d bigint,\s*messages_7d bigint,\s*messages_30d bigint/s);
        expect(migration).not.toMatch(/message\.body|profile\.nama/);
    });
});