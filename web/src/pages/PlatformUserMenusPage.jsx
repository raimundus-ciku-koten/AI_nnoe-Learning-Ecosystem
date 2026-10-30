import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { supabase } from '../lib/supabase.ts';
import { useAuth } from '../context/AuthContext.jsx';
import { kunciMenu, menuUntukPeran } from '../navigasi.js';
import {
    muatMenuNonaktifPengguna,
    simpanMenuNonaktifPengguna,
} from '../services/platformMenuAccess.js';
import '../styles/platform-tenants.css';

const PAGE_SIZE = 50;

function rolesPengguna(user) {
    const roles = Array.isArray(user.roles) && user.roles.length
        ? user.roles
        : user.role && user.role !== 'unprovisioned' ? [user.role] : [];
    return [...new Set(roles.filter((role) => typeof role === 'string'))];
}

function daftarMenuPengguna(user) {
    const groups = new Map();
    for (const role of rolesPengguna(user)) {
        for (const group of menuUntukPeran(role)) {
            const items = groups.get(group.id) || { ...group, item: [] };
            const known = new Set(items.item.map((item) => kunciMenu(group, item)));
            for (const item of group.item) {
                const key = kunciMenu(group, item);
                if (!known.has(key)) {
                    items.item.push(item);
                    known.add(key);
                }
            }
            groups.set(group.id, items);
        }
    }
    return [...groups.values()];
}

export default function PlatformUserMenusPage() {
    const { role } = useAuth();
    const [users, setUsers] = useState([]);
    const [selectedUser, setSelectedUser] = useState(null);
    const [disabledKeys, setDisabledKeys] = useState([]);
    const [search, setSearch] = useState('');
    const [loading, setLoading] = useState(false);
    const [loadingMore, setLoadingMore] = useState(false);
    const [loadingOverrides, setLoadingOverrides] = useState(false);
    const [saving, setSaving] = useState(false);
    const [hasMore, setHasMore] = useState(false);
    const [error, setError] = useState('');
    const [notice, setNotice] = useState('');
    const cursor = useRef(null);
    const loadingRef = useRef(false);

    const loadUsers = useCallback(async (next = false) => {
        if (role !== 'superadmin' || loadingRef.current) return;
        loadingRef.current = true;
        setLoading(!next);
        setLoadingMore(next);
        setError('');
        if (!next) {
            cursor.current = null;
            setUsers([]);
            setHasMore(false);
        }
        try {
            let query = supabase
                .from('profiles')
                .select('id,email,nama,role,roles,tenant_id,active')
                .neq('role', 'superadmin')
                .order('id')
                .limit(PAGE_SIZE + 1);
            if (next && cursor.current) query = query.gt('id', cursor.current);
            const { data, error: queryError } = await query;
            if (queryError) throw queryError;
            const page = (data || []).slice(0, PAGE_SIZE);
            cursor.current = page.at(-1)?.id || cursor.current;
            setHasMore((data || []).length > PAGE_SIZE);
            setUsers((current) => next ? [...current, ...page] : page);
        } catch (cause) {
            console.error('[platform-menu-access] Gagal memuat pengguna:', cause);
            setError(cause?.code === '42501'
                ? 'Akses daftar pengguna ditolak. Pastikan sesi superadmin aktif.'
                : 'Daftar pengguna tidak dapat dimuat. Periksa RLS dan koneksi.');
        } finally {
            loadingRef.current = false;
            setLoading(false);
            setLoadingMore(false);
        }
    }, [role]);

    useEffect(() => {
        if (role === 'superadmin') void loadUsers();
    }, [loadUsers, role]);

    const visibleUsers = useMemo(() => {
        const term = search.trim().toLocaleLowerCase('id');
        if (!term) return users;
        return users.filter((user) =>
            [user.nama, user.email, user.role, user.tenant_id, user.id]
                .some((value) => String(value || '').toLocaleLowerCase('id').includes(term)));
    }, [search, users]);

    async function selectUser(user) {
        setSelectedUser(user);
        setDisabledKeys([]);
        setError('');
        setNotice('');
        setLoadingOverrides(true);
        try {
            setDisabledKeys(await muatMenuNonaktifPengguna(user.id));
        } catch (cause) {
            console.error('[platform-menu-access] Gagal memuat konfigurasi menu pengguna:', cause);
            setError(cause?.code === '42501'
                ? 'Pengaturan menu ditolak. Pastikan sesi superadmin masih aktif.'
                : 'Pengaturan menu tidak dapat dimuat. Pastikan migrasi manajemen menu tersedia.');
            setSelectedUser(null);
        } finally {
            setLoadingOverrides(false);
        }
    }

    function setMenuEnabled(menuKey, enabled) {
        setDisabledKeys((current) => {
            const next = new Set(current);
            if (enabled) next.delete(menuKey);
            else next.add(menuKey);
            return [...next].sort();
        });
        setNotice('');
    }

    async function saveOverrides() {
        if (!selectedUser || saving || loadingOverrides) return;
        setSaving(true);
        setError('');
        setNotice('');
        try {
            const result = await simpanMenuNonaktifPengguna(selectedUser.id, disabledKeys);
            setDisabledKeys(result.disabled_menu_keys);
            setNotice(result.changed
                ? `Menu pengguna ${selectedUser.email || selectedUser.id} diperbarui dan dicatat pada audit platform. Perubahan terlihat setelah sesi pengguna memuat ulang konfigurasi.`
                : 'Tidak ada perubahan konfigurasi menu.');
        } catch (cause) {
            console.error('[platform-menu-access] Gagal menyimpan konfigurasi menu:', cause);
            setError(cause?.code === '42501'
                ? 'Perubahan menu ditolak oleh backend.'
                : cause?.message || 'Perubahan menu tidak dapat disimpan.');
        } finally {
            setSaving(false);
        }
    }

    if (role !== 'superadmin') {
        return (
            <main className="platform-tenants">
                <section className="platform-tenants-card" role="alert">
                    <h1>Menu pengguna</h1>
                    <p>Pengaturan menu per pengguna hanya tersedia bagi superadmin.</p>
                </section>
            </main>
        );
    }

    const groups = selectedUser ? daftarMenuPengguna(selectedUser) : [];
    const dashboardMenuKeys = new Set(groups.flatMap((group) => group.item
        .filter((item) => item.path === '/dashboard')
        .map((item) => kunciMenu(group, item))));

    return (
        <main className="platform-tenants">
            <header className="platform-tenants-heading">
                <p className="platform-tenants-kicker">Manajemen fitur · akses navigasi</p>
                <h1>Menu per Pengguna</h1>
                <p>Aktif/nonaktifkan tautan navigasi untuk akun tertentu. Perubahan disimpan melalui RPC superadmin dan dicatat pada audit.</p>
            </header>

            <p className="platform-ops-note" role="note">
                Kontrol ini mengatur tampilan menu dan gerbang rute aplikasi, bukan pengganti otorisasi data. Tenant scope dan Row Level Security tetap menentukan akses ke data dan RPC.
            </p>
            {error && <p className="platform-tenants-error" role="alert">{error}</p>}
            {notice && <p className="platform-tenant-letterhead-notice" role="status">{notice}</p>}

            <section className="platform-tenants-card" aria-labelledby="menu-user-directory-title">
                <div className="platform-tenants-toolbar">
                    <div>
                        <h2 id="menu-user-directory-title">Pilih pengguna</h2>
                        <p>{users.length} akun dimuat; hasil menggunakan halaman berurutan.</p>
                    </div>
                    <label className="platform-tenants-search">
                        Cari nama, email, tenant, atau ID
                        <input type="search" value={search} onChange={(event) => setSearch(event.target.value)} />
                    </label>
                    <button className="platform-tenants-button secondary" type="button" onClick={() => void loadUsers()} disabled={loading || loadingMore}>
                        {loading ? 'Memuat…' : 'Muat ulang'}
                    </button>
                </div>

                {loading && !users.length && <p className="platform-tenants-empty" role="status">Memuat pengguna…</p>}
                {!loading && !visibleUsers.length && <p className="platform-tenants-empty">Tidak ada pengguna yang cocok.</p>}
                {visibleUsers.length > 0 && (
                    <div className="platform-tenants-table-wrap">
                        <table className="platform-tenants-table">
                            <thead><tr><th scope="col">Pengguna</th><th scope="col">Peran</th><th scope="col">Tenant</th><th scope="col">Status</th><th scope="col">Aksi</th></tr></thead>
                            <tbody>
                                {visibleUsers.map((user) => (
                                    <tr key={user.id}>
                                        <th scope="row">{user.nama || 'Pengguna'}<small>{user.email || user.id}</small></th>
                                        <td>{rolesPengguna(user).join(', ') || 'Belum memiliki peran'}</td>
                                        <td>{user.tenant_id || '—'}</td>
                                        <td>{user.active ? 'Aktif' : 'Nonaktif'}</td>
                                        <td>
                                            <button className="platform-tenants-button secondary" type="button" onClick={() => void selectUser(user)}>
                                                Atur menu
                                            </button>
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                )}
                {hasMore && (
                    <div className="platform-tenants-more">
                        <button className="platform-tenants-button" type="button" onClick={() => void loadUsers(true)} disabled={loading || loadingMore}>
                            {loadingMore ? 'Memuat…' : 'Muat pengguna berikutnya'}
                        </button>
                    </div>
                )}
            </section>

            {selectedUser && (
                <section className="platform-tenants-card" aria-labelledby="user-menu-overrides-title">
                    <div className="platform-tenants-toolbar">
                        <div>
                            <h2 id="user-menu-overrides-title">Hak menu: {selectedUser.nama || selectedUser.email}</h2>
                            <p>{selectedUser.email || selectedUser.id} · {rolesPengguna(selectedUser).join(', ') || 'Belum memiliki peran'}</p>
                        </div>
                        <button className="platform-tenants-button" type="button" onClick={() => void saveOverrides()} disabled={saving || loadingOverrides || !groups.length}>
                            {saving ? 'Menyimpan…' : 'Simpan perubahan'}
                        </button>
                    </div>
                    {loadingOverrides ? <p role="status">Memuat pengaturan menu…</p> : !groups.length ? (
                        <p className="platform-tenants-empty">Pengguna ini belum memiliki peran yang menyediakan menu.</p>
                    ) : (
                        <div className="platform-user-menu-groups">
                            {groups.map((group) => (
                                <fieldset key={group.id} className="platform-user-menu-group">
                                    <legend>{group.label}</legend>
                                    {group.item.map((item) => {
                                        const key = kunciMenu(group, item);
                                        const essential = dashboardMenuKeys.has(key);
                                        return (
                                            <label className="platform-user-menu-option" key={key}>
                                                <input
                                                    type="checkbox"
                                                    checked={essential || !disabledKeys.includes(key)}
                                                    disabled={essential || loadingOverrides || saving}
                                                    onChange={(event) => setMenuEnabled(key, event.target.checked)}
                                                />
                                                <span>{item.label}</span>
                                                {essential && <small>Menu inti · selalu aktif</small>}
                                            </label>
                                        );
                                    })}
                                </fieldset>
                            ))}
                        </div>
                    )}
                </section>
            )}
        </main>
    );
}
