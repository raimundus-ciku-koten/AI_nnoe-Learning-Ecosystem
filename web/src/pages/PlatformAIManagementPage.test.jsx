import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const auth = vi.hoisted(() => ({ role: 'superadmin' }));
const controls = vi.hoisted(() => ({
    loading: false,
    maintenance: false,
    features: { aiAssistant: true, aiGeneration: false },
    error: '',
}));
vi.mock('../context/AuthContext.jsx', () => ({ useAuth: () => auth }));
vi.mock('../context/PlatformControlContext.jsx', () => ({ usePlatformControls: () => controls }));
vi.mock('../services/platformAdminApi.js', () => ({ setPlatformControl: vi.fn() }));

import PlatformAIManagementPage from './PlatformAIManagementPage.jsx';

describe('platform AI management page', () => {
    beforeEach(() => {
        auth.role = 'superadmin';
        controls.loading = false;
        controls.features = { aiAssistant: true, aiGeneration: false };
        controls.error = '';
    });

    it('shows server-controlled flags and explicitly reports unavailable provider telemetry', () => {
        const html = renderToStaticMarkup(<PlatformAIManagementPage />);
        expect(html).toContain('Manajemen AI Platform');
        expect(html).toContain('Asisten AI');
        expect(html).toContain('Generator AI');
        expect(html).toContain('belum tersedia sebagai telemetry server tepercaya');
        expect(html).toContain('kunci pribadi sementara di browser pengguna');
    });

    it('blocks non-superadmin users', () => {
        auth.role = 'admin_sekolah';
        const html = renderToStaticMarkup(<PlatformAIManagementPage />);
        expect(html).toContain('Kontrol AI global hanya tersedia untuk superadmin');
        expect(html).not.toContain('Provider, kunci, dan telemetry');
    });
});
