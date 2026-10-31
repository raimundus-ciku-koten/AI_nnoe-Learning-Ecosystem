import { beforeEach, describe, expect, it, vi } from 'vitest';

const { supabase } = vi.hoisted(() => ({ supabase: { rpc: vi.fn() } }));
vi.mock('../lib/supabase.ts', () => ({ supabase }));

import {
    muatHalamanPesananKeuanganSekolah,
    muatLaporanKehadiranSekolah,
    muatLaporanKehadiranSekolahRentang,
    muatPesananKeuanganSekolah,
    muatRingkasanKeuanganSekolah,
} from './schoolReporting.js';

const today = new Date().toISOString().slice(0, 10);
const startDate = new Date(Date.now() - 6 * 86_400_000).toISOString().slice(0, 10);
const sampleOrder = {
    order_id: 'ALE-order-1', plan_name: 'Sekolah Basic', billing_cycle: 'tahunan',
    subtotal: '1000', tax_amount: '110', total: '1110', status: 'paid',
    payment_status: 'settlement', created_at: '2026-10-01T00:00:00Z',
    paid_at: '2026-10-01T01:00:00Z', expires_at: '2026-10-02T00:00:00Z',
};

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

    it('loads bounded date-range attendance and validates the date range before requesting data', async () => {
        supabase.rpc.mockResolvedValueOnce({
            data: [{ tanggal: startDate, kelas: '7A', hadir_scan: '12' }],
            error: null,
        });
        await expect(muatLaporanKehadiranSekolahRentang({ startDate, endDate: today }))
            .resolves.toEqual([{ tanggal: startDate, kelas: '7A', hadir_scan: 12 }]);
        expect(supabase.rpc).toHaveBeenCalledWith('school_admin_attendance_report_range', {
            p_start_date: startDate,
            p_end_date: today,
        });
        await expect(muatLaporanKehadiranSekolahRentang({ startDate: '2020-01-01', endDate: today }))
            .rejects.toThrow('Rentang tanggal');
        const tomorrow = new Date(`${today}T00:00:00.000Z`);
        tomorrow.setUTCDate(tomorrow.getUTCDate() + 1);
        await expect(muatLaporanKehadiranSekolahRentang({
            startDate: today,
            endDate: tomorrow.toISOString().slice(0, 10),
        })).rejects.toThrow('tidak melewati hari ini');
        expect(supabase.rpc).toHaveBeenCalledTimes(1);
    });

    it('loads reconciled finance totals and a keyset page without provider secrets', async () => {
        supabase.rpc
            .mockResolvedValueOnce({
                data: [{
                    order_count: '4', paid_count: '1', pending_count: '1', failed_count: '1',
                    paid_amount: '1110', pending_amount: '0', paid_review_count: '1',
                    paid_review_amount: '500',
                }],
                error: null,
            })
            .mockResolvedValueOnce({ data: [sampleOrder], error: null });
        await expect(muatRingkasanKeuanganSekolah({ startDate, endDate: today }))
            .resolves.toMatchObject({ order_count: 4, paid_amount: 1110, paid_review_amount: 500 });
        await expect(muatHalamanPesananKeuanganSekolah({
            startDate, endDate: today, status: 'paid', limit: 50,
        })).resolves.toMatchObject({
            rows: [{ order_id: sampleOrder.order_id, total: 1110 }],
            hasMore: false,
            nextCursor: null,
        });
        expect(supabase.rpc.mock.calls).toEqual([
            ['school_admin_payment_order_summary', { p_start_date: startDate, p_end_date: today }],
            ['school_admin_payment_orders_page', {
                p_start_date: startDate,
                p_end_date: today,
                p_status: 'paid',
                p_after_created_at: null,
                p_after_order_id: null,
                p_limit: 51,
            }],
        ]);
    });

    it('rejects inconsistent finance summaries, unknown provider fields, and malformed cursors', async () => {
        supabase.rpc.mockResolvedValueOnce({
            data: [{
                order_count: 2, paid_count: 1, pending_count: 1, failed_count: 1,
                paid_amount: 100, pending_amount: 0, paid_review_count: 0, paid_review_amount: 0,
            }],
            error: null,
        });
        await expect(muatRingkasanKeuanganSekolah({ startDate, endDate: today })).rejects.toThrow('tidak valid');
        supabase.rpc.mockResolvedValueOnce({
            data: [{ ...sampleOrder, midtrans_transaction_id: 'private' }],
            error: null,
        });
        await expect(muatHalamanPesananKeuanganSekolah({ startDate, endDate: today }))
            .rejects.toThrow('tidak valid');
        await expect(muatHalamanPesananKeuanganSekolah({
            startDate, endDate: today, cursor: { created_at: 'invalid', order_id: 'bad' },
        })).rejects.toThrow('Kursor');
    });
});