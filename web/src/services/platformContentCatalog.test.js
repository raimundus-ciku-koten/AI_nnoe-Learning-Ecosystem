import { beforeEach, describe, expect, it, vi } from 'vitest';

const { supabase } = vi.hoisted(() => ({ supabase: { rpc: vi.fn() } }));
vi.mock('../lib/supabase.ts', () => ({ supabase }));

import {
    arsipkanKonten,
    muatKatalogKonten,
    muatKontenGlobalTenant,
    imporSoalGlobalKeBank,
    simpanDrafKonten,
    terbitkanKonten,
} from './platformContentCatalog.js';

const item = {
    id: 'content-1', content_type: 'template_perangkat', title: 'Rencana',
    description: '', content_text: 'Tujuan dan langkah', question_items: [], answer_key: {}, subject: '', grade_level: '',
    license_label: 'CC BY 4.0', source_url: 'https://example.test/source',
    status: 'draft', version: 1, created_at: '2026-10-30T00:00:00Z',
    updated_at: '2026-10-30T00:00:00Z', published_at: null,
};

describe('platform content catalog RPC adapter', () => {
    beforeEach(() => vi.clearAllMocks());

    it('loads one typed global catalog and validates returned fields', async () => {
        supabase.rpc.mockResolvedValueOnce({ data: [item], error: null });
        await expect(muatKatalogKonten('template_perangkat')).resolves.toEqual([item]);
        expect(supabase.rpc).toHaveBeenCalledWith('platform_content_list', { p_content_type: 'template_perangkat' });
        supabase.rpc.mockResolvedValueOnce({ data: [{ ...item, answer_key: 'secret' }], error: null });
        await expect(muatKatalogKonten(null)).rejects.toThrow('tidak valid');
    });

    it('normalizes bounded draft values and refuses non-HTTPS sources', async () => {
        supabase.rpc.mockResolvedValueOnce({ data: [{ saved_id: 'content-1', saved_version: 2 }], error: null });
        await expect(simpanDrafKonten({
            id: 'content-1', contentType: 'template_perangkat', title: '  Rencana ',
            description: '', contentText: 'Isi', sourceUrl: 'https://example.test/source',
        })).resolves.toEqual({ saved_id: 'content-1', saved_version: 2 });
        expect(supabase.rpc).toHaveBeenCalledWith('platform_content_save', expect.objectContaining({
            p_title: 'Rencana', p_source_url: 'https://example.test/source',
        }));
        await expect(simpanDrafKonten({ contentType: 'modul', title: 'Modul', sourceUrl: 'http://example.test' }))
            .rejects.toThrow('HTTPS');
    });

    it('calls publish/archive RPCs and rejects missing IDs', async () => {
        supabase.rpc.mockResolvedValue({ data: null, error: null });
        await expect(terbitkanKonten('content-1')).resolves.toBeUndefined();
        await expect(arsipkanKonten('content-1')).resolves.toBeUndefined();
        await expect(terbitkanKonten('')).rejects.toThrow('ID konten');
        expect(supabase.rpc.mock.calls.map(([name]) => name)).toEqual([
            'platform_content_publish', 'platform_content_archive',
        ]);
    });

    it('loads published tenant content without answer keys and imports bank questions server-side', async () => {
        const publicBank = {
            id: 'content-2', content_type: 'bank_soal', title: 'Pecahan', description: '', content_text: '',
            question_items: [{ position: 1, kind: 'pilihan_ganda', prompt: '1/2 + 1/2 = ?', choices: ['0', '1'] }],
            subject: 'Matematika', grade_level: '4', license_label: 'CC BY 4.0',
            source_url: '', version: 1, published_at: '2026-10-30T00:00:00Z',
        };
        supabase.rpc.mockResolvedValueOnce({ data: [publicBank], error: null })
            .mockResolvedValueOnce({ data: 1, error: null });
        await expect(muatKontenGlobalTenant('bank_soal')).resolves.toEqual([publicBank]);
        await expect(imporSoalGlobalKeBank({ contentId: 'content-2', mapel: 'Matematika', kelas: '4A' })).resolves.toBe(1);
        expect(supabase.rpc.mock.calls[0][0]).toBe('tenant_global_content_catalog');
        expect(supabase.rpc.mock.calls[1]).toEqual(['import_published_platform_questions', {
            p_content_id: 'content-2', p_mapel: 'Matematika', p_kelas: '4A',
        }]);

        supabase.rpc.mockResolvedValueOnce({ data: [{ ...publicBank, answer_key: { 1: '1' } }], error: null });
        await expect(muatKontenGlobalTenant('bank_soal')).rejects.toThrow('tidak valid');
    });
});
