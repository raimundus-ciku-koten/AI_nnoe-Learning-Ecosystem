import { beforeEach, describe, expect, it, vi } from 'vitest';

const { supabase } = vi.hoisted(() => ({ supabase: { from: vi.fn() } }));
vi.mock('../lib/supabase.ts', () => ({ supabase }));

import {
  hapusJurnalMengajar,
  muatJurnalMengajar,
  muatKelasRosterGuru,
  roleDapatMengelolaJurnal,
  simpanJurnalMengajar,
  ubahJurnalMengajar,
} from './teacherJournals.js';

const row = {
  id: 'journal-a',
  tenant_id: 'school-a',
  author_id: 'teacher-a',
  class_name: '7A',
  subject: 'Matematika',
  lesson_date: '2026-10-23',
  topic: 'Bilangan',
  learning_objective: 'Memahami bilangan bulat.',
  activities: 'Diskusi dan latihan.',
  reflection: '',
  follow_up: '',
  status: 'draf',
  created_at: '2026-10-23T01:00:00.000Z',
  updated_at: '2026-10-23T01:00:00.000Z',
};
const draft = {
  className: row.class_name,
  subject: row.subject,
  date: row.lesson_date,
  topic: row.topic,
  learningObjective: row.learning_objective,
  activities: row.activities,
  reflection: '',
  followUp: '',
  status: row.status,
};

function builder(result) {
  const query = {};
  for (const method of ['select', 'insert', 'update', 'delete', 'eq', 'order']) {
    query[method] = vi.fn(() => query);
  }
  query.limit = vi.fn(() => Promise.resolve(result));
  query.single = vi.fn(() => Promise.resolve(result));
  query.maybeSingle = vi.fn(() => Promise.resolve(result));
  return query;
}

describe('teacher journal service', () => {
  beforeEach(() => vi.clearAllMocks());

  it('loads only the teacher roster classes and own tenant journal', async () => {
    const classes = builder({ data: [{ kelas: '7A' }, { kelas: '7B' }, { kelas: '7A' }], error: null });
    supabase.from.mockReturnValueOnce(classes);
    await expect(muatKelasRosterGuru(' school-a ', ' teacher-a ')).resolves.toEqual(['7A', '7B']);
    expect(classes.eq.mock.calls).toEqual([
      ['tenant_id', 'school-a'],
      ['owner_id', 'teacher-a'],
    ]);

    const journals = builder({ data: [row], error: null });
    supabase.from.mockReturnValueOnce(journals);
    await expect(muatJurnalMengajar('school-a', 'teacher-a')).resolves.toMatchObject([
      { id: row.id, className: '7A', status: 'draf' },
    ]);
    expect(journals.eq.mock.calls).toEqual([
      ['tenant_id', 'school-a'],
      ['author_id', 'teacher-a'],
    ]);
    expect(journals.limit).toHaveBeenCalledWith(200);
  });

  it('validates journal fields and calendar dates before writes', async () => {
    await expect(simpanJurnalMengajar('school-a', 'teacher-a', { ...draft, date: '2026-02-30' }))
      .rejects.toThrow('Tanggal');
    await expect(simpanJurnalMengajar('school-a', 'teacher-a', { ...draft, activities: '  ' }))
      .rejects.toThrow('Kegiatan pembelajaran');
    await expect(simpanJurnalMengajar('school-a', 'teacher-a', { ...draft, topic: 'x'.repeat(201) }))
      .rejects.toThrow('Topik');
    expect(supabase.from).not.toHaveBeenCalled();

    const inserted = builder({ data: row, error: null });
    supabase.from.mockReturnValueOnce(inserted);
    await expect(simpanJurnalMengajar('school-a', 'teacher-a', draft))
      .resolves.toMatchObject({ id: row.id, learningObjective: row.learning_objective });
    expect(inserted.insert).toHaveBeenCalledWith({
      class_name: '7A',
      subject: 'Matematika',
      lesson_date: '2026-10-23',
      topic: 'Bilangan',
      learning_objective: 'Memahami bilangan bulat.',
      activities: 'Diskusi dan latihan.',
      reflection: '',
      follow_up: '',
      status: 'draf',
      tenant_id: 'school-a',
      author_id: 'teacher-a',
    });
  });

  it('scopes updates and deletions and surfaces stale rows or backend errors', async () => {
    const updated = builder({ data: row, error: null });
    supabase.from.mockReturnValueOnce(updated);
    await expect(ubahJurnalMengajar('school-a', 'teacher-a', 'journal-a', draft))
      .resolves.toMatchObject({ id: row.id });
    expect(updated.eq.mock.calls).toEqual([
      ['tenant_id', 'school-a'],
      ['author_id', 'teacher-a'],
      ['id', 'journal-a'],
    ]);

    const missing = builder({ data: null, error: null });
    supabase.from.mockReturnValueOnce(missing);
    await expect(ubahJurnalMengajar('school-a', 'teacher-a', 'missing', draft))
      .rejects.toThrow('tidak ditemukan');

    const deleted = builder({ data: { id: row.id }, error: null });
    supabase.from.mockReturnValueOnce(deleted);
    await expect(hapusJurnalMengajar('school-a', 'teacher-a', 'journal-a')).resolves.toBeUndefined();

    const failure = builder({ data: null, error: new Error('denied') });
    supabase.from.mockReturnValueOnce(failure);
    await expect(muatJurnalMengajar('school-a', 'teacher-a')).rejects.toThrow('denied');
  });

  it('allows only teacher roles', () => {
    for (const role of ['guru', 'guru_bk', 'guru_kokurikuler', 'guru_ekstrakurikuler']) {
      expect(roleDapatMengelolaJurnal(role)).toBe(true);
    }
    for (const role of ['admin_sekolah', 'operator', 'siswa', 'superadmin']) {
      expect(roleDapatMengelolaJurnal(role)).toBe(false);
    }
  });
});
