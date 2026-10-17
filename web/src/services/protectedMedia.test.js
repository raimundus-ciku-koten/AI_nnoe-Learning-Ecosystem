import { afterEach, describe, expect, it, vi } from 'vitest';
import { getState, setState } from '../state.js';
import { uidDariUrlFotoProfil, urlFotoProfil } from './protectedMedia.js';

vi.mock('../lib/supabase.ts', () => ({ supabase: {} }));

describe('URL foto profil Supabase', () => {
  afterEach(() => {
    setState({ tenantId: null });
  });

  it('membuat alamat foto berdasarkan tenant aktif', () => {
    setState({ tenantId: 'school-a' });
    expect(urlFotoProfil('user_123'))
      .toBe('supabase://profile-media/school-a/user_123/avatar.jpg');
  });

  it('mengambil hanya UID dari URL foto internal yang valid', () => {
    expect(uidDariUrlFotoProfil('supabase://profile-media/school-a/user_123/avatar.jpg'))
      .toBe('user_123');
    expect(uidDariUrlFotoProfil('https://firebasestorage.googleapis.com/v0/b/legacy/o/photo.jpg'))
      .toBeNull();
    expect(uidDariUrlFotoProfil('supabase://profile-media/school-a/user_123/private.jpg'))
      .toBeNull();
  });

  it('menolak identitas yang tidak aman untuk jalur penyimpanan', () => {
    setState({ tenantId: 'school-a' });
    expect(() => urlFotoProfil('../other-user')).toThrow();
    expect(getState().tenantId).toBe('school-a');
  });
});
