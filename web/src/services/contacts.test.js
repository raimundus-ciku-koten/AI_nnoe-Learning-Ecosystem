import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  supabase: { from: vi.fn() },
  state: { getState: vi.fn(), setState: vi.fn() },
  ringkas: vi.fn((value) => value),
}));

vi.mock('../lib/supabase.ts', () => ({ supabase: mocks.supabase }));
vi.mock('../state.js', () => mocks.state);
vi.mock('../utils/chatUtil.js', () => ({ ringkas: mocks.ringkas }));

import { GalatKontak, kirimPermintaan } from './contacts.js';

const sender = {
  uid: '11111111-1111-4111-8111-111111111111',
  nama: 'Pengirim',
};
const recipient = {
  uid: '22222222-2222-4222-8222-222222222222',
  nama: 'Penerima',
};
const relationId = '33333333-3333-4333-8333-333333333333';

function configureContactQueries({ lookups, insert, accepted = { data: { id: relationId }, error: null } }) {
  const lookupResults = [...lookups];
  const lookup = {
    maybeSingle: vi.fn(async () => lookupResults.shift()),
  };
  const lookupFilter = { or: vi.fn(() => lookup) };
  const select = { select: vi.fn(() => lookupFilter) };
  const insertSingle = { single: vi.fn(async () => insert) };
  const insertSelect = { select: vi.fn(() => insertSingle) };
  const updateQuery = {
    eq: vi.fn(() => updateQuery),
    select: vi.fn(() => updateQuery),
    maybeSingle: vi.fn(async () => accepted),
  };
  const update = { update: vi.fn(() => updateQuery) };

  mocks.supabase.from.mockImplementation(() => ({
    ...select,
    insert: vi.fn(() => insertSelect),
    ...update,
  }));
  return { lookup, updateQuery };
}

describe('contact request uniqueness races', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('accepts a reverse request that wins the pair-unique-index race', async () => {
    const { lookup, updateQuery } = configureContactQueries({
      lookups: [
        { data: null, error: null },
        {
          data: {
            id: relationId,
            from_user_id: recipient.uid,
            to_user_id: sender.uid,
            status: 'pending',
          },
          error: null,
        },
      ],
      insert: { data: null, error: { code: '23505' } },
    });

    await expect(kirimPermintaan(sender, recipient)).resolves.toBe(relationId);
    expect(lookup.maybeSingle).toHaveBeenCalledTimes(2);
    expect(updateQuery.eq).toHaveBeenNthCalledWith(1, 'id', relationId);
    expect(updateQuery.eq).toHaveBeenNthCalledWith(2, 'to_user_id', sender.uid);
    expect(updateQuery.eq).toHaveBeenNthCalledWith(3, 'status', 'pending');
  });

  it('reports the existing outgoing request when it wins the race', async () => {
    configureContactQueries({
      lookups: [
        { data: null, error: null },
        {
          data: {
            id: relationId,
            from_user_id: sender.uid,
            to_user_id: recipient.uid,
            status: 'pending',
          },
          error: null,
        },
      ],
      insert: { data: null, error: { code: '23505' } },
    });

    await expect(kirimPermintaan(sender, recipient)).rejects.toMatchObject({
      name: 'GalatKontak',
      message: 'Permintaan sudah dikirim, menunggu persetujuan.',
    });
  });

  it('does not hide unrelated database errors', async () => {
    const databaseError = { code: '42501', message: 'permission denied' };
    configureContactQueries({
      lookups: [{ data: null, error: null }],
      insert: { data: null, error: databaseError },
    });

    await expect(kirimPermintaan(sender, recipient)).rejects.toBe(databaseError);
  });

  it('still rejects an already accepted contact before attempting an insert', async () => {
    configureContactQueries({
      lookups: [{
        data: {
          id: relationId,
          from_user_id: sender.uid,
          to_user_id: recipient.uid,
          status: 'accepted',
        },
        error: null,
      }],
      insert: { data: null, error: null },
    });

    await expect(kirimPermintaan(sender, recipient)).rejects.toBeInstanceOf(GalatKontak);
  });
});
