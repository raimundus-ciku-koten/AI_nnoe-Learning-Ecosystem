import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const auth = vi.hoisted(() => ({ role: 'superadmin' }));
vi.mock('../context/AuthContext.jsx', () => ({ useAuth: () => auth }));
vi.mock('../services/platformMenuAccess.js', () => ({
    muatMenuNonaktifPengguna: vi.fn(),
    simpanMenuNonaktifPengguna: vi.fn(),
}));

import PlatformUserMenusPage from './PlatformUserMenusPage.jsx';

describe('platform user menu access page', () => {
    beforeEach(() => {
        auth.role = 'superadmin';
    });

    it('provides superadmin menu controls and explains the authorization boundary', () => {
        const html = renderToStaticMarkup(<PlatformUserMenusPage />);
        expect(html).toContain('Menu per Pengguna');
        expect(html).toContain('Pilih pengguna');
        expect(html).toContain('bukan pengganti otorisasi data');
        expect(html).toContain('RPC superadmin');
    });

    it('blocks users without the superadmin role', () => {
        auth.role = 'guru';
        const html = renderToStaticMarkup(<PlatformUserMenusPage />);
        expect(html).toContain('Pengaturan menu per pengguna hanya tersedia bagi superadmin');
        expect(html).not.toContain('Pilih pengguna');
    });
});
