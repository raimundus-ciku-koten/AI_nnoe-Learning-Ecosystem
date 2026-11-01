import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';

const { auth } = vi.hoisted(() => ({
  auth: { user: null, role: 'siswa', activeRole: '', tenantId: '' },
}));
vi.mock('../context/AuthContext.jsx', () => ({ useAuth: () => auth }));

import LessonJournalPage from './LessonJournalPage.jsx';

describe('LessonJournalPage', () => {
  it('denies access to non-teacher roles', () => {
    auth.role = 'siswa';
    const markup = renderToStaticMarkup(<LessonJournalPage />);
    expect(markup).toContain('Jurnal mengajar hanya dapat dikelola oleh guru');
    expect(markup).toContain('role="alert"');
  });

  it('shows an explicit loading state for an authorized teacher', () => {
    auth.user = { uid: 'teacher-1' };
    auth.role = 'guru';
    auth.tenantId = 'school-1';
    const markup = renderToStaticMarkup(<LessonJournalPage />);
    expect(markup).toContain('Jurnal Mengajar Harian');
    expect(markup).toContain('Memuat penugasan kelas dan mata pelajaran');
    expect(markup).toContain('aria-busy="true"');
  });
});
