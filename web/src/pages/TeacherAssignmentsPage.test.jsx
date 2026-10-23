import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';

const auth = vi.hoisted(() => ({ user: { uid: 'teacher-a' }, role: 'guru', tenantId: 'school-a' }));
vi.mock('../context/AuthContext.jsx', () => ({ useAuth: () => auth }));
vi.mock('../services/teacherAssignments.js', () => ({
  muatPenugasanGuru: vi.fn(async () => ({ kelas: [], mapel: [] })),
}));

import TeacherAssignmentsPage from './TeacherAssignmentsPage.jsx';

describe('teacher assignments page', () => {
  it('shows the account-scoped, read-only assignment workspace', () => {
    auth.role = 'guru';
    const html = renderToStaticMarkup(React.createElement(TeacherAssignmentsPage));
    expect(html).toContain('Kelas &amp; Mapel Saya');
    expect(html).toContain('hanya membaca penugasan pada profil akun Anda');
    expect(html).toContain('Memuat penugasan mengajar');
  });

  it('denies non-teacher roles', () => {
    auth.role = 'admin_sekolah';
    expect(renderToStaticMarkup(React.createElement(TeacherAssignmentsPage)))
      .toContain('Akses penugasan guru tidak tersedia');
  });

  it('denies teacher accounts without an active tenant', () => {
    auth.role = 'guru';
    auth.tenantId = '';
    expect(renderToStaticMarkup(React.createElement(TeacherAssignmentsPage)))
      .toContain('Akun guru belum terhubung ke sekolah aktif');
    auth.tenantId = 'school-a';
  });
});
