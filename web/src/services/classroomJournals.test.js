import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => {
  const state = {
    configured: true,
    rows: [],
    row: {
      id: 'journal-1',
      classroom_id: 'class-1',
      tenant_id: 'tenant-1',
      author_id: 'teacher-1',
      lesson_date: '2026-10-25',
      topic: 'Sistem persamaan',
      objectives: 'Menyelesaikan persamaan linear.',
      activities: 'Diskusi dan latihan.',
      reflection: '',
      follow_up: '',
      created_at: '2026-10-25T10:00:00Z',
      updated_at: '2026-10-25T10:00:00Z',
    },
  };
  const query = {};
  for (const method of ['select', 'insert', 'update', 'delete', 'eq', 'order', 'limit']) {
    query[method] = vi.fn(() => query);
  }
  query.single = vi.fn(() => Promise.resolve({ data: state.row, error: null }));
  query.then = (resolve, reject) => Promise.resolve({ data: state.rows, error: null }).then(resolve, reject);
  const from = vi.fn(() => query);
  return { state, query, from };
});

vi.mock('../lib/supabase.ts', () => ({
  supabase: { from: mocks.from },
  get isSupabaseConfigured() { return mocks.state.configured; },
  supabaseConfigError: null,
}));

import {
  createClassroomJournal,
  deleteClassroomJournal,
  listClassroomJournals,
  updateClassroomJournal,
} from './classroomJournals.js';

const context = { userId: 'teacher-1', activeRole: 'guru', tenantId: 'tenant-1' };
const input = {
  lessonDate: '2026-10-25',
  topic: ' Sistem persamaan ',
  objectives: ' Menyelesaikan persamaan linear. ',
  activities: ' Diskusi dan latihan. ',
  reflection: '',
  followUp: '',
};

describe('classroomJournals', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.state.configured = true;
    mocks.state.rows = [];
    mocks.state.row = {
      id: 'journal-1',
      classroom_id: 'class-1',
      tenant_id: 'tenant-1',
      author_id: 'teacher-1',
      lesson_date: '2026-10-25',
      topic: 'Sistem persamaan',
      objectives: 'Menyelesaikan persamaan linear.',
      activities: 'Diskusi dan latihan.',
      reflection: '',
      follow_up: '',
      created_at: '2026-10-25T10:00:00Z',
      updated_at: '2026-10-25T10:00:00Z',
    };
  });

  it('memuat catatan hanya untuk kelas, tenant, dan penulis aktif', async () => {
    await expect(listClassroomJournals(context, 'class-1')).resolves.toEqual([]);
    expect(mocks.from).toHaveBeenCalledWith('learning_classroom_journals');
    expect(mocks.query.eq).toHaveBeenCalledWith('tenant_id', 'tenant-1');
    expect(mocks.query.eq).toHaveBeenCalledWith('classroom_id', 'class-1');
    expect(mocks.query.eq).toHaveBeenCalledWith('author_id', 'teacher-1');
    expect(mocks.query.limit).toHaveBeenCalledWith(100);
  });

  it('menyimpan jurnal dengan tenant, kelas, dan author dari sesi terautentikasi', async () => {
    const result = await createClassroomJournal(context, 'class-1', input);
    expect(result.topic).toBe('Sistem persamaan');
    expect(mocks.query.insert).toHaveBeenCalledWith(expect.objectContaining({
      classroom_id: 'class-1',
      tenant_id: 'tenant-1',
      author_id: 'teacher-1',
      lesson_date: '2026-10-25',
      topic: 'Sistem persamaan',
    }));
  });

  it('menolak tanggal mustahil dan input kosong sebelum permintaan database', async () => {
    await expect(createClassroomJournal(context, 'class-1', {
      ...input,
      lessonDate: '2026-02-30',
    })).rejects.toThrow('Tanggal pembelajaran tidak valid');
    await expect(createClassroomJournal(context, 'class-1', {
      ...input,
      topic: ' ',
    })).rejects.toThrow('Topik wajib diisi');
    expect(mocks.from).not.toHaveBeenCalled();
  });

  it('hanya menerima peran guru dan menolak kelas kosong', async () => {
    await expect(listClassroomJournals({
      ...context,
      activeRole: 'operator',
    }, 'class-1')).rejects.toThrow('hanya tersedia bagi guru');
    await expect(listClassroomJournals(context, '')).rejects.toThrow('Pilih ruang kelas');
    expect(mocks.from).not.toHaveBeenCalled();
  });

  it('memfilter pengubahan dan penghapusan dengan id, kelas, tenant, dan author', async () => {
    await updateClassroomJournal(context, 'class-1', 'journal-1', input);
    await deleteClassroomJournal(context, 'class-1', 'journal-1');
    expect(mocks.query.eq).toHaveBeenCalledWith('id', 'journal-1');
    expect(mocks.query.eq).toHaveBeenCalledWith('classroom_id', 'class-1');
    expect(mocks.query.eq).toHaveBeenCalledWith('tenant_id', 'tenant-1');
    expect(mocks.query.eq).toHaveBeenCalledWith('author_id', 'teacher-1');
  });

  it('menampilkan error konfigurasi database secara eksplisit', async () => {
    mocks.state.configured = false;
    await expect(listClassroomJournals(context, 'class-1'))
      .rejects.toThrow('Supabase belum dikonfigurasi');
    expect(mocks.from).not.toHaveBeenCalled();
  });
});
