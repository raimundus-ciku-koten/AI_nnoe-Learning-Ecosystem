import { beforeEach, describe, expect, it, vi } from 'vitest';

const { queryLog, dataByTable, supabaseMock } = vi.hoisted(() => ({
  queryLog: [],
  dataByTable: {},
  supabaseMock: {
    from: vi.fn(),
    rpc: vi.fn(),
  },
}));

vi.mock('../lib/supabase.ts', () => ({ supabase: supabaseMock }));

function queryFor(table) {
  const query = {
    table,
    select: vi.fn(() => query),
    eq: vi.fn((...args) => {
      queryLog.push([table, 'eq', ...args]);
      return query;
    }),
    or: vi.fn(() => query),
    order: vi.fn(() => query),
    limit: vi.fn(() => query),
    in: vi.fn(() => query),
    then(resolve, reject) {
      return Promise.resolve({ data: dataByTable[table] || [], error: null }).then(resolve, reject);
    },
  };
  return query;
}

import {
  muatKandidatWaliSiswa,
  ubahStatusWaliSiswa,
} from './studentGuardianLinks.js';

describe('studentGuardianLinks tenant API', () => {
  beforeEach(() => {
    queryLog.length = 0;
    dataByTable.students = [
      { id: 'student-a', nama: 'Siswa A', kelas: '4A', tenant_id: 'school-a' },
    ];
    dataByTable.profiles = [
      { id: 'guardian-a', nama: 'Wali A', role: 'ortu', roles: ['ortu'], tenant_id: 'school-a', active: true },
    ];
    dataByTable.student_guardian_links = [
      { id: 'link-a', student_id: 'student-a', guardian_user_id: 'guardian-a', status: 'pending' },
    ];
    dataByTable.student_guardian_link_audit = [
      { id: 'audit-a', student_id: 'student-a', guardian_user_id: 'guardian-a', actor_id: 'admin-a', action: 'request', new_status: 'pending' },
    ];
    dataByTable.profiles.push({ id: 'admin-a', nama: 'Admin A' });
    supabaseMock.from.mockImplementation((table) => queryFor(table));
    supabaseMock.rpc.mockReset().mockResolvedValue({ error: null });
  });

  it('loads tenant-scoped candidates, relationship status, and mapped audit', async () => {
    const result = await muatKandidatWaliSiswa('school-a');

    expect(result.students).toHaveLength(1);
    expect(result.links[0].student.nama).toBe('Siswa A');
    expect(result.links[0].guardian.nama).toBe('Wali A');
    expect(result.audit[0].guardian.nama).toBe('Wali A');
    expect(result.audit[0].actor.nama).toBe('Admin A');
    expect(queryLog).toEqual(expect.arrayContaining([
      ['students', 'eq', 'tenant_id', 'school-a'],
      ['profiles', 'eq', 'tenant_id', 'school-a'],
      ['student_guardian_links', 'eq', 'tenant_id', 'school-a'],
      ['student_guardian_link_audit', 'eq', 'tenant_id', 'school-a'],
    ]));
  });

  it('rejects a missing tenant before querying data', async () => {
    await expect(muatKandidatWaliSiswa(' ')).rejects.toThrow('tenant aktif');
    expect(supabaseMock.from).not.toHaveBeenCalled();
  });

  it('only calls the audited server RPC for valid state transitions', async () => {
    await ubahStatusWaliSiswa('student-a', 'guardian-a', 'verify');

    expect(supabaseMock.rpc).toHaveBeenCalledWith('manage_student_guardian_link', {
      p_student_id: 'student-a',
      p_guardian_user_id: 'guardian-a',
      p_action: 'verify',
    });
    await expect(ubahStatusWaliSiswa('', 'guardian-a', 'verify')).rejects.toThrow('tidak valid');
    expect(supabaseMock.rpc).toHaveBeenCalledTimes(1);
  });

  it('surfaces server errors instead of reporting successful verification', async () => {
    supabaseMock.rpc.mockResolvedValue({ error: new Error('forbidden') });

    await expect(ubahStatusWaliSiswa('student-a', 'guardian-a', 'verify')).rejects.toThrow('forbidden');
  });
});
