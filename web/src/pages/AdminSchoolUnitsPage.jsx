import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useAuth } from '../context/AuthContext.jsx';
import { buatUnitSekolah, JENJANG_UNIT, muatUnitSekolah, ubahUnitSekolah } from '../services/schoolUnits.js';
import '../styles/admin-school-units.css';

const KOSONG = { id: '', code: '', name: '', educationLevel: 'sma', active: true };

function pesanGalat(error) {
    if (error?.code === '42P01') return 'Fitur Unit dan Jenjang belum tersedia pada database ini. Migration perlu diterapkan setelah validasi Staging.';
    if (error?.code === '23505') return 'Kode unit sudah digunakan pada sekolah ini.';
    if (error?.code === '42501') return 'Perubahan ditolak. Pastikan Anda admin aktif pada tenant sekolah ini.';
    return error?.message || 'Unit sekolah belum dapat diproses. Periksa koneksi dan coba lagi.';
}

export default function AdminSchoolUnitsPage() {
    const { user, role, activeRole, tenantId } = useAuth();
    const roleAktif = activeRole || role;
    const canManage = roleAktif === 'admin_sekolah';
    const [units, setUnits] = useState([]);
    const [form, setForm] = useState(KOSONG);
    const [search, setSearch] = useState('');
    const [loading, setLoading] = useState(true);
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState('');
    const [notice, setNotice] = useState('');

    const refresh = useCallback(async () => {
        if (!canManage || !tenantId) {
            setUnits([]);
            setLoading(false);
            return;
        }
        setLoading(true);
        setError('');
        try {
            setUnits(await muatUnitSekolah(tenantId));
        } catch (cause) {
            console.error('[school-units] Gagal memuat unit sekolah:', cause);
            setError(pesanGalat(cause));
        } finally {
            setLoading(false);
        }
    }, [canManage, tenantId]);

    useEffect(() => { void refresh(); }, [refresh]);

    const visibleUnits = useMemo(() => {
        const term = search.trim().toLocaleLowerCase('id');
        return units.filter((unit) => !term
            || `${unit.code} ${unit.name} ${unit.education_level}`.toLocaleLowerCase('id').includes(term));
    }, [search, units]);

    function edit(unit) {
        setForm({
            id: unit.id,
            code: unit.code,
            name: unit.name,
            educationLevel: unit.education_level,
            active: unit.active,
        });
        setError('');
        setNotice('');
        document.getElementById('school-unit-code')?.focus();
    }

    function resetForm() {
        setForm(KOSONG);
        setError('');
    }

    async function submit(event) {
        event.preventDefault();
        if (!canManage || !tenantId || !user?.uid || busy) return;
        setBusy(true);
        setError('');
        setNotice('');
        try {
            if (form.id) {
                await ubahUnitSekolah({
                    tenantId,
                    actorId: user.uid,
                    unitId: form.id,
                    unit: form,
                });
                setNotice('Unit sekolah diperbarui.');
            } else {
                await buatUnitSekolah({ tenantId, actorId: user.uid, unit: form });
                setNotice('Unit sekolah ditambahkan.');
            }
            setForm(KOSONG);
            await refresh();
        } catch (cause) {
            console.error('[school-units] Gagal menyimpan unit sekolah:', cause);
            setError(pesanGalat(cause));
        } finally {
            setBusy(false);
        }
    }

    async function toggleActive(unit) {
        if (!canManage || !tenantId || !user?.uid || busy) return;
        setBusy(true);
        setError('');
        setNotice('');
        try {
            await ubahUnitSekolah({
                tenantId,
                actorId: user.uid,
                unitId: unit.id,
                unit: {
                    code: unit.code,
                    name: unit.name,
                    educationLevel: unit.education_level,
                    active: !unit.active,
                },
            });
            setNotice(unit.active ? 'Unit dinonaktifkan. Data historis tetap dipertahankan.' : 'Unit diaktifkan kembali.');
            await refresh();
        } catch (cause) {
            console.error('[school-units] Gagal mengubah status unit:', cause);
            setError(pesanGalat(cause));
        } finally {
            setBusy(false);
        }
    }

    if (!canManage) {
        return (
            <section className="school-units-denied" role="alert">
                <h1>Unit dan Jenjang</h1>
                <p>Pengelolaan unit hanya tersedia bagi admin sekolah pada tenant aktif.</p>
            </section>
        );
    }

    if (!tenantId) {
        return (
            <section className="school-units-denied" role="alert">
                <h1>Tenant sekolah belum tersedia</h1>
                <p>Sesi akun tidak memiliki identitas tenant. Hubungi administrator platform.</p>
            </section>
        );
    }

    return (
        <main className="school-units-page" aria-labelledby="school-units-title">
            <header className="school-units-header">
                <p className="school-units-eyebrow">Manajemen Instansi · tenant sekolah</p>
                <h1 id="school-units-title">Unit dan Jenjang</h1>
                <p>Kelola unit pendidikan yang berada di bawah sekolah ini. Perubahan hanya berlaku pada tenant aktif.</p>
            </header>

            <section className="school-units-editor" aria-labelledby="school-unit-form-title">
                <div className="school-units-section-heading">
                    <div>
                        <p className="school-units-eyebrow">{form.id ? 'Perbarui unit' : 'Unit baru'}</p>
                        <h2 id="school-unit-form-title">{form.id ? 'Edit unit sekolah' : 'Tambah unit sekolah'}</h2>
                    </div>
                    {form.id && <span className="school-units-editing">Mengedit</span>}
                </div>
                <form onSubmit={submit}>
                    <label htmlFor="school-unit-code">Kode unit</label>
                    <input
                        id="school-unit-code"
                        required
                        maxLength={30}
                        pattern="[A-Za-z0-9][A-Za-z0-9_-]{0,29}"
                        value={form.code}
                        disabled={busy}
                        onChange={(event) => setForm((current) => ({ ...current, code: event.target.value }))}
                        placeholder="Contoh: SMA-UTAMA"
                    />
                    <label htmlFor="school-unit-name">Nama unit</label>
                    <input
                        id="school-unit-name"
                        required
                        maxLength={120}
                        value={form.name}
                        disabled={busy}
                        onChange={(event) => setForm((current) => ({ ...current, name: event.target.value }))}
                        placeholder="Contoh: SMA Utama"
                    />
                    <label htmlFor="school-unit-level">Jenjang pendidikan</label>
                    <select
                        id="school-unit-level"
                        value={form.educationLevel}
                        disabled={busy}
                        onChange={(event) => setForm((current) => ({ ...current, educationLevel: event.target.value }))}
                    >
                        {JENJANG_UNIT.map((level) => <option key={level.value} value={level.value}>{level.label}</option>)}
                    </select>
                    {form.id && (
                        <label className="school-units-active-toggle">
                            <input
                                type="checkbox"
                                checked={form.active}
                                disabled={busy}
                                onChange={(event) => setForm((current) => ({ ...current, active: event.target.checked }))}
                            />
                            Unit aktif
                        </label>
                    )}
                    {error && <p className="school-units-error" role="alert">{error}</p>}
                    {notice && <p className="school-units-notice" role="status">{notice}</p>}
                    <div className="school-units-actions">
                        <button type="submit" disabled={busy}>
                            {busy ? 'Menyimpan…' : form.id ? 'Simpan perubahan' : 'Tambah unit'}
                        </button>
                        {form.id && <button type="button" className="is-secondary" disabled={busy} onClick={resetForm}>Batal</button>}
                    </div>
                </form>
            </section>

            <section className="school-units-list" aria-labelledby="school-units-list-title">
                <div className="school-units-list-heading">
                    <div>
                        <h2 id="school-units-list-title">Daftar unit</h2>
                        <p>{units.filter((unit) => unit.active).length} unit aktif · {units.length} total</p>
                    </div>
                    <label>
                        <span className="school-units-sr-only">Cari unit</span>
                        <input type="search" value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Cari kode atau nama unit" />
                    </label>
                    <button type="button" className="is-secondary" disabled={loading} onClick={() => void refresh()}>
                        {loading ? 'Memuat…' : 'Muat ulang'}
                    </button>
                </div>
                {loading && <p className="school-units-empty" role="status">Memuat unit sekolah…</p>}
                {!loading && !error && !visibleUnits.length && (
                    <p className="school-units-empty">{search ? 'Tidak ada unit yang cocok.' : 'Belum ada unit. Tambahkan unit pertama untuk sekolah ini.'}</p>
                )}
                {visibleUnits.length > 0 && (
                    <div className="school-units-table-wrap">
                        <table>
                            <thead><tr><th scope="col">Kode</th><th scope="col">Nama unit</th><th scope="col">Jenjang</th><th scope="col">Status</th><th scope="col"><span className="school-units-sr-only">Tindakan</span></th></tr></thead>
                            <tbody>
                                {visibleUnits.map((unit) => (
                                    <tr key={unit.id}>
                                        <td><code>{unit.code}</code></td>
                                        <th scope="row">{unit.name}</th>
                                        <td>{JENJANG_UNIT.find((level) => level.value === unit.education_level)?.label || unit.education_level}</td>
                                        <td><span className={`school-units-status ${unit.active ? 'is-active' : ''}`}>{unit.active ? 'Aktif' : 'Nonaktif'}</span></td>
                                        <td className="school-units-row-actions">
                                            <button type="button" disabled={busy} onClick={() => edit(unit)}>Edit</button>
                                            <button type="button" className={unit.active ? 'is-danger' : ''} disabled={busy} onClick={() => void toggleActive(unit)}>
                                                {unit.active ? 'Nonaktifkan' : 'Aktifkan'}
                                            </button>
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                )}
            </section>
        </main>
    );
}