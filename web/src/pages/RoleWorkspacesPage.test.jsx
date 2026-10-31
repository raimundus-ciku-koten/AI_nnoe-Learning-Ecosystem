import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({ loadLedger: vi.fn() }));
vi.mock('../services/onlineAssessments.js', () => ({ muatLegerUjianWali: mocks.loadLedger }));

import HomeroomAcademicPage from './HomeroomAcademicPage.jsx';
import SchoolSupervisionPage from './SchoolSupervisionPage.jsx';

function renderPage(Page, path) {
    return renderToStaticMarkup(
        React.createElement(MemoryRouter, { initialEntries: [path] }, React.createElement(Page)),
    );
}

describe('role-specific academic workspaces', () => {
    beforeEach(() => mocks.loadLedger.mockReset());

    it('loads the exam ledger view through its server-backed route', () => {
        const html = renderPage(HomeroomAcademicPage, '/wali-kelas/leger');

        expect(html).toContain('Leger nilai dan rapor');
        expect(html).toContain('Memuat leger dari server');
        expect(html).toContain('belum mencakup mata pelajaran non-ujian');
        expect(mocks.loadLedger).not.toHaveBeenCalled();
    });

    it('keeps the wali kelas report clearly marked as a preview', () => {
        const html = renderPage(HomeroomAcademicPage, '/wali-kelas/rapor');

        expect(html).toContain('Pratinjau saja');
        expect(html).toContain('nilai mata pelajaran non-ujian belum tersedia di sistem');
        expect(html).toContain('bukan dokumen rapor resmi');
    });

    it('shows the staged supervision workflow and school-specific calendar caveat', () => {
        const html = renderPage(SchoolSupervisionPage, '/kepala-sekolah/supervisi');

        expect(html).toContain('Pra-observasi');
        expect(html).toContain('Observasi kelas');
        expect(html).toContain('Pasca-observasi dan RTL');
        expect(html).toContain('Kalender akademik SMA Frateran Podor 2026/2027');
        expect(html).toContain('bukan kalender umum');
        expect(html).toContain('Belum ada tabel atau RPC supervisi');
    });

    it.each([
        ['/jadwal', 'Tanggal rencana'],
        ['/pra-observasi', 'Fokus yang disepakati'],
        ['/observasi', 'Bukti pembelajaran yang teramati'],
        ['/tindak-lanjut', 'Dukungan / aksi berikutnya'],
    ])('provides an appropriate form for %s', (suffix, label) => {
        const html = renderPage(SchoolSupervisionPage, `/kepala-sekolah/supervisi${suffix}`);

        expect(html).toContain(label);
        expect(html).toContain('Draf sementara');
        expect(html).toContain('pedoman-kalender-pendidikan-ntt-2026-2027.pdf');
    });
});