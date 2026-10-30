import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const state = vi.hoisted(() => ({
    features: { aiAssistant: true },
    user: { uid: 'teacher-test' },
}));

vi.mock('../context/PlatformControlContext.jsx', () => ({
    usePlatformControls: () => ({ features: state.features }),
}));
vi.mock('../context/AuthContext.jsx', () => ({
    useAuth: () => ({ user: state.user }),
}));
vi.mock('../services/aiAssistant.js', () => ({ tanyaAsisten: vi.fn() }));

import AsistenPage from './AsistenPage.jsx';

function renderPage() {
    return renderToStaticMarkup(<AsistenPage />);
}

function composerFrom(html) {
    return html.match(/<textarea\b[^>]*id="ai-prompt"[^>]*>/)?.[0] || '';
}

describe('AsistenPage', () => {
    beforeEach(() => {
        state.features.aiAssistant = true;
    });

    it('menyediakan composer dan menjelaskan mode lokal ketika kontrol AI aktif', () => {
        const html = renderPage();
        const composer = composerFrom(html);

        expect(html).toContain('AI_nnoe Lokal memberi panduan berbasis pola');
        expect(html).toContain('href="#/pengaturan/api-ai"');
        expect(composer).not.toContain('disabled');
    });

    it('tetap menonaktifkan composer ketika administrator mematikan AI', () => {
        state.features.aiAssistant = false;
        const html = renderPage();
        const composer = composerFrom(html);

        expect(html).toContain('Asisten AI sedang dinonaktifkan oleh administrator.');
        expect(composer).toMatch(/\sdisabled(?:="")?(?:\s|>)/);
    });
});