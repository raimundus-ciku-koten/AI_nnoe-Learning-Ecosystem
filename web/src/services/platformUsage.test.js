import { beforeEach, describe, expect, it, vi } from 'vitest';

const { supabase } = vi.hoisted(() => ({ supabase: { rpc: vi.fn() } }));
vi.mock('../lib/supabase.ts', () => ({ supabase }));

import { muatSnapshotPlatform } from './platformUsage.js';

const snapshot = {
    snapshot_at: '2026-10-30T12:00:00Z', tenant_count: 2, active_tenant_count: 1,
    profile_count: 50, active_profile_count: 40, school_admin_count: 1,
    student_count: 100, attendance_scan_90d: 250, chat_messages_30d: 750,
    exams_30d: 8, question_bank_count: 90, published_content_count: 3,
};

describe('platform usage snapshot', () => {
    beforeEach(() => vi.clearAllMocks());

    it('maps current database row counts and calls the authorized aggregate RPC', async () => {
        supabase.rpc.mockResolvedValueOnce({ data: [snapshot], error: null });
        await expect(muatSnapshotPlatform()).resolves.toMatchObject({
            snapshotAt: snapshot.snapshot_at,
            tenant_count: 2,
            attendance_scan_90d: 250,
            published_content_count: 3,
        });
        expect(supabase.rpc).toHaveBeenCalledWith('platform_usage_snapshot');
    });

    it('rejects malformed, negative, or identity-bearing metrics', async () => {
        supabase.rpc.mockResolvedValueOnce({ data: [{ ...snapshot, student_names: ['private'] }], error: null });
        await expect(muatSnapshotPlatform()).rejects.toThrow('tidak valid');
        supabase.rpc.mockResolvedValueOnce({ data: [{ ...snapshot, student_count: -1 }], error: null });
        await expect(muatSnapshotPlatform()).rejects.toThrow('tidak valid');
        supabase.rpc.mockResolvedValueOnce({ data: null, error: new Error('denied') });
        await expect(muatSnapshotPlatform()).rejects.toThrow('denied');
    });
});
