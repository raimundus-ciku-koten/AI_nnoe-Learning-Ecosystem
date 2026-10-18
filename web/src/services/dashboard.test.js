import { beforeEach, describe, expect, it, vi } from 'vitest';

const { supabase } = vi.hoisted(() => ({ supabase: { from: vi.fn() } }));
vi.mock('../lib/supabase.ts', () => ({ supabase }));

import { muatPercakapanTerbaruDasbor } from './dashboard.js';

function makeQuery(response) {
  const query = {
    select: vi.fn(() => query),
    order: vi.fn(() => query),
    limit: vi.fn(() => Promise.resolve(response)),
  };
  return query;
}

describe('Supabase dashboard chat preview', () => {
  beforeEach(() => vi.clearAllMocks());

  it('loads and maps the latest RLS-scoped conversations', async () => {
    const query = makeQuery({
      data: [{
        conversation_id: 'conversation-1',
        name: 'Guru',
        last_text: 'Sampai jumpa',
        last_message_at: '2026-10-18T01:00:00Z',
        unread_count: 2,
      }],
      error: null,
    });
    supabase.from.mockReturnValueOnce(query);

    await expect(muatPercakapanTerbaruDasbor()).resolves.toEqual([{
      id: 'conversation-1',
      title: 'Guru',
      lastMessage: 'Sampai jumpa',
      lastAt: '2026-10-18T01:00:00Z',
      unread: 2,
    }]);
    expect(supabase.from).toHaveBeenCalledWith('chat_inbox');
    expect(query.select).toHaveBeenCalledWith('conversation_id,name,last_text,last_message_at,unread_count');
    expect(query.order).toHaveBeenCalledWith('last_message_at', { ascending: false });
    expect(query.limit).toHaveBeenCalledWith(20);
  });

  it('surfaces query errors and rejects malformed rows', async () => {
    supabase.from.mockReturnValueOnce(makeQuery({ data: null, error: new Error('denied') }));
    await expect(muatPercakapanTerbaruDasbor()).rejects.toThrow('denied');

    supabase.from.mockReturnValueOnce(makeQuery({
      data: [{ conversation_id: 'conversation-1', name: 'Guru', unread_count: -1 }],
      error: null,
    }));
    await expect(muatPercakapanTerbaruDasbor()).rejects.toThrow('tidak valid');
  });
});
