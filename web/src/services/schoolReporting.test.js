import { beforeEach, describe, expect, it, vi } from 'vitest';

const { supabase } = vi.hoisted(() => ({ supabase: { rpc: vi.fn() } }));
vi.mock('../lib/supabase.ts', () => ({ supabase }));

import { muatLaporanKehadiranSekolah, muatPesananKeuanganSekolah } from './schoolReporting.js';

describe('school reports and finance RPC adapters', () => {
    beforeEach(() => vi.clearAllMocks());

    it('loads aggregate attendance and tenant payment orders through scoped RPCs', async () => {
        supabase.rpc.mockResolvedValueOnce({ data: [{ tanggal: '2026-10-30', kelas: '7A', hadir_scan: '12' }], error: null })
            .mockResolvedValueOnce({
                data: [{
                    order_id: 'ALE-order-1', plan_name: 'Sekolah Basic', billing_cycle: 'tahunan',
                    subtotal: '1000', tax_amount: '110', total: '1110', status: 'paid',
                    payment_status: 'settlement', created_at: '2026-10-01T00:00:00Z',
                    paid_at: '2026-10-01T01:00:00Z', expires_at: '2026-10-02T00:00:00Z',
                }], error: null
            });
        await expect(muatLaporanKehadiranSekolah()).resolves.toEqual([
            { tanggal: '2026-10-30', kelas: '7A', hadir_scan: 12 },
        ]);
        await expect(muatPesananKeuanganSekolah()).resolves.toMatchObject([{ subtotal: 1000, total: 1110 }]);
        expect(supabase.rpc.mock.calls.map(([name]) => name)).toEqual([
            'school_admin_attendance_report', 'school_admin_payment_orders',
        ]);
    });

    it('rejects identifying attendance, invalid order totals, and backend errors', async () => {
        supabase.rpc.mockResolvedValueOnce({ data: [{ tanggal: '2026-10-30', kelas: '7A', hadir_scan: 1, student_id: 'private' }], error: null });
        await expect(muatLaporanKehadiranSekolah()).rejects.toThrow('tidak valid');
        supabase.rpc.mockResolvedValueOnce({
            data: [{
                order_id: 'ALE-order-1', plan_name: 'Paket', billing_cycle: 'bulanan',
                subtotal: 100, tax_amount: 10, total: 999, status: 'paid', payment_status: null,
                created_at: '2026-10-01T00:00:00Z', paid_at: null, expires_at: '2026-11-01T00:00:00Z',
            }], error: null
        });
        await expect(muatPesananKeuanganSekolah()).rejects.toThrow('tidak valid');
        supabase.rpc.mockResolvedValueOnce({ data: null, error: new Error('denied') });
        await expect(muatPesananKeuanganSekolah()).rejects.toThrow('denied');
    });
});