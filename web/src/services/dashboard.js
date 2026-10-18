import { supabase } from '../lib/supabase.ts';

const BATAS_PERCAKAPAN_TERBARU = 20;

export async function muatPercakapanTerbaruDasbor() {
  const { data, error } = await supabase
    .from('chat_inbox')
    .select('conversation_id,name,last_text,last_message_at,unread_count')
    .order('last_message_at', { ascending: false })
    .limit(BATAS_PERCAKAPAN_TERBARU);

  if (error) throw error;
  if (!Array.isArray(data)) throw new Error('Daftar percakapan dasbor tidak valid.');

  return data.map((row) => {
    const unread = Number(row.unread_count);
    if (typeof row.conversation_id !== 'string' ||
        typeof row.name !== 'string' ||
        row.unread_count == null ||
        !Number.isSafeInteger(unread) ||
        unread < 0 ||
        (row.last_text != null && typeof row.last_text !== 'string') ||
        (row.last_message_at != null && typeof row.last_message_at !== 'string')) {
      throw new Error('Data percakapan dasbor tidak valid.');
    }
    return {
      id: row.conversation_id,
      title: row.name,
      lastMessage: row.last_text || '',
      lastAt: row.last_message_at,
      unread,
    };
  });
}
