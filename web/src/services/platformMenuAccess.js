import { supabase } from '../lib/supabase.ts';

const KEY_PATTERN = /^[a-z0-9-]+\|\/[a-z0-9/_-]+(\?[a-zA-Z0-9_=&%-]+)?$/;

function validasiKeys(keys, { allowDashboard = false } = {}) {
    if (!Array.isArray(keys) || keys.length > 200
        || keys.some((key) => typeof key !== 'string'
            || key.length < 5 || key.length > 240
            || !KEY_PATTERN.test(key)
            || (!allowDashboard && /\|\/dashboard(?:\?|$)/.test(key)))
        || new Set(keys).size !== keys.length) {
        throw new Error('Daftar menu nonaktif dari server tidak valid.');
    }
    return keys;
}

export async function muatMenuNonaktifSaya() {
    const { data, error } = await supabase.rpc('current_user_disabled_menu_keys');
    if (error) throw error;
    if (!Array.isArray(data) || data.some((row) =>
        !row || typeof row.menu_key !== 'string' || Object.keys(row).some((key) => key !== 'menu_key'))) {
        throw new Error('Konfigurasi menu pengguna tidak valid.');
    }
    return validasiKeys(data.map((row) => row.menu_key));
}

export async function muatMenuNonaktifPengguna(userId) {
    if (typeof userId !== 'string' || !userId.trim()) throw new TypeError('ID pengguna tidak valid.');
    const { data, error } = await supabase.rpc('platform_user_menu_overrides', {
        p_user_id: userId,
    });
    if (error) throw error;
    if (!Array.isArray(data) || data.some((row) =>
        !row || typeof row.menu_key !== 'string' || Object.keys(row).some((key) => key !== 'menu_key'))) {
        throw new Error('Konfigurasi menu pengguna tidak valid.');
    }
    return validasiKeys(data.map((row) => row.menu_key));
}

export async function simpanMenuNonaktifPengguna(userId, disabledMenuKeys) {
    if (typeof userId !== 'string' || !userId.trim()) throw new TypeError('ID pengguna tidak valid.');
    const keys = validasiKeys(disabledMenuKeys);
    const { data, error } = await supabase.rpc('set_platform_user_disabled_menus', {
        p_user_id: userId,
        p_disabled_menu_keys: keys,
    });
    if (error) throw error;
    if (!data || typeof data.changed !== 'boolean'
        || !Array.isArray(data.disabled_menu_keys)
        || JSON.stringify(validasiKeys(data.disabled_menu_keys)) !== JSON.stringify([...keys].sort())) {
        throw new Error('Respons perubahan menu pengguna tidak valid.');
    }
    return data;
}
