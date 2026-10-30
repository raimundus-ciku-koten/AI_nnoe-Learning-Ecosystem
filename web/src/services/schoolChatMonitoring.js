import { supabase } from '../lib/supabase.ts';

const FIELDS = [
    'conversation_count', 'active_conversations_30d', 'messages_7d', 'messages_30d',
];

export async function muatRingkasanChatSekolah() {
    const { data, error } = await supabase.rpc('school_admin_chat_overview');
    if (error) throw error;
    if (!Array.isArray(data) || data.length !== 1) {
        throw new Error('Ringkasan chat sekolah tidak valid.');
    }
    const row = data[0];
    if (!row || Object.keys(row).some((key) => !FIELDS.includes(key)) ||
        FIELDS.some((key) => !Number.isSafeInteger(Number(row[key])) || Number(row[key]) < 0)) {
        throw new Error('Ringkasan chat sekolah tidak valid.');
    }
    return Object.fromEntries(FIELDS.map((key) => [key, Number(row[key])]));
}