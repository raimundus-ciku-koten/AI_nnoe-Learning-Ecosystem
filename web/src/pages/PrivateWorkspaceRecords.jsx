import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useAuth } from '../context/AuthContext.jsx';
import {
  buatCatatanRuangKerja,
  daftarCatatanRuangKerja,
  hapusCatatanRuangKerja,
  PrivateWorkspaceSchemaUnavailableError,
  perbaruiCatatanRuangKerja,
} from '../services/privateWorkspace.js';
import '../styles/private-workspace.css';

const STATUS = [
  { value: 'planned', label: 'Rencana' },
  { value: 'in_progress', label: 'Sedang dikerjakan' },
  { value: 'done', label: 'Selesai' },
];

function tanggalLokal(value) {
  if (!value) return 'Tanpa target tanggal';
  const date = new Date(`${value}T00:00:00`);
  return new Intl.DateTimeFormat('id-ID', { dateStyle: 'long' }).format(date);
}

export default function PrivateWorkspaceRecords({
  route,
  search = '',
  heading = 'Catatan kerja pribadi',
}) {
  const { user, role, activeRole, tenantId, isDemo } = useAuth();
  const currentRole = activeRole || role;
  const context = useMemo(() => ({
    userId: user?.uid,
    role,
    activeRole: currentRole,
    tenantId,
  }), [currentRole, role, tenantId, user?.uid]);
  const [records, setRecords] = useState([]);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [schemaUnavailable, setSchemaUnavailable] = useState(false);
  const [editingId, setEditingId] = useState('');
  const [query, setQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [form, setForm] = useState({
    title: '',
    details: '',
    status: 'planned',
    dueDate: '',
  });

  const loadRecords = useCallback(async () => {
    setLoading(true);
    setError('');
    setSchemaUnavailable(false);
    setRecords([]);
    try {
      const rows = await daftarCatatanRuangKerja(context, route, search);
      setRecords(rows);
    } catch (cause) {
      setRecords([]);
      if (cause instanceof PrivateWorkspaceSchemaUnavailableError) {
        setSchemaUnavailable(true);
      }
      setError(cause instanceof Error ? cause.message : 'Catatan gagal dimuat.');
    } finally {
      setLoading(false);
    }
  }, [context, route, search]);

  useEffect(() => {
    if (isDemo) {
      setRecords([]);
      setError('Ruang kerja pribadi memerlukan akun sekolah yang aktif; data demo tidak disimpan.');
      setLoading(false);
      return;
    }
    void loadRecords();
  }, [isDemo, loadRecords]);

  function resetForm() {
    setForm({ title: '', details: '', status: 'planned', dueDate: '' });
    setEditingId('');
  }

  async function submit(event) {
    event.preventDefault();
    setSubmitting(true);
    setError('');
    try {
      const input = { ...form, dueDate: form.dueDate || null };
      if (editingId) {
        await perbaruiCatatanRuangKerja(context, route, editingId, input, search);
      } else {
        await buatCatatanRuangKerja(context, route, input, search);
      }
      resetForm();
      await loadRecords();
    } catch (cause) {
      if (cause instanceof PrivateWorkspaceSchemaUnavailableError) {
        setSchemaUnavailable(true);
      }
      setError(cause instanceof Error ? cause.message : 'Catatan gagal disimpan.');
    } finally {
      setSubmitting(false);
    }
  }

  function edit(record) {
    setEditingId(record.id);
    setForm({
      title: record.title,
      details: record.details,
      status: record.status,
      dueDate: record.dueDate || '',
    });
    document.getElementById('private-workspace-title')?.focus();
  }

  async function remove(record) {
    if (!window.confirm(`Hapus catatan "${record.title}"? Tindakan ini tidak dapat dibatalkan.`)) return;
    setError('');
    try {
      await hapusCatatanRuangKerja(context, route, record.id, search);
      setRecords((current) => current.filter((entry) => entry.id !== record.id));
      if (editingId === record.id) resetForm();
    } catch (cause) {
      if (cause instanceof PrivateWorkspaceSchemaUnavailableError) {
        setSchemaUnavailable(true);
      }
      setError(cause instanceof Error ? cause.message : 'Catatan gagal dihapus.');
    }
  }

  const filteredRecords = records.filter((record) => {
    const matchesQuery = `${record.title} ${record.details}`.toLocaleLowerCase('id')
      .includes(query.trim().toLocaleLowerCase('id'));
    return matchesQuery && (statusFilter === 'all' || record.status === statusFilter);
  });

  return (
    <section className="ale-private-workspace" aria-labelledby="private-workspace-heading">
      <div className="ale-private-workspace-heading">
        <div>
          <p className="ale-submenu-kicker">Ruang kerja akun</p>
          <h3 id="private-workspace-heading">{heading}</h3>
          <p>Catatan hanya dapat dikelola oleh akun dan peran aktif Anda.</p>
        </div>
        <span className="ale-private-workspace-count">
          {schemaUnavailable ? 'Belum tersedia' : `${records.length} catatan`}
        </span>
      </div>

      <p className="ale-private-workspace-privacy">
        Gunakan untuk pengingat pribadi, bukan arsip akademik resmi. Hindari mencantumkan
        kata sandi, kunci API, atau data sensitif/identitas siswa. Data mengikuti kontrol
        akses akun sekolah.
      </p>

      {error && (
        <div className="ale-private-workspace-error" role="alert">
          <span>{error}</span>
          {schemaUnavailable && (
            <p className="ale-private-workspace-empty" role="status">
              Minta administrator sekolah menyelesaikan aktivasi skema sebelum menggunakan catatan pribadi.
            </p>
          )}

          {!isDemo && !schemaUnavailable && (
            <button type="button" className="ale-private-workspace-button secondary" onClick={loadRecords}>
              Coba lagi
            </button>
          )}
        </div>
      )}

      {!isDemo && !schemaUnavailable && (
        <div className="ale-private-workspace-grid">
          <form className="ale-private-workspace-form" onSubmit={submit}>
            <h4>{editingId ? 'Ubah catatan' : 'Catatan baru'}</h4>
            <label htmlFor="private-workspace-title">Judul</label>
            <input
              id="private-workspace-title"
              required
              maxLength={120}
              value={form.title}
              onChange={(event) => setForm({ ...form, title: event.target.value })}
              placeholder="Contoh: Tinjau kembali rencana pekan depan"
            />
            <label htmlFor="private-workspace-details">Rincian</label>
            <textarea
              id="private-workspace-details"
              maxLength={6000}
              rows={5}
              value={form.details}
              onChange={(event) => setForm({ ...form, details: event.target.value })}
              placeholder="Tambahkan konteks atau tindak lanjut..."
            />
            <div className="ale-private-workspace-form-row">
              <div>
                <label htmlFor="private-workspace-status">Status</label>
                <select
                  id="private-workspace-status"
                  value={form.status}
                  onChange={(event) => setForm({ ...form, status: event.target.value })}
                >
                  {STATUS.map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}
                </select>
              </div>
              <div>
                <label htmlFor="private-workspace-date">Target tanggal</label>
                <input
                  id="private-workspace-date"
                  type="date"
                  value={form.dueDate}
                  onChange={(event) => setForm({ ...form, dueDate: event.target.value })}
                />
              </div>
            </div>
            <div className="ale-private-workspace-actions">
              <button type="submit" className="ale-private-workspace-button" disabled={submitting}>
                {submitting ? 'Menyimpan...' : editingId ? 'Simpan perubahan' : 'Simpan catatan'}
              </button>
              {editingId && (
                <button type="button" className="ale-private-workspace-button secondary" onClick={resetForm}>
                  Batal
                </button>
              )}
            </div>
          </form>

          <div className="ale-private-workspace-list">
            <div className="ale-private-workspace-filters">
              <label className="sr-only" htmlFor="private-workspace-search">Cari catatan</label>
              <input
                id="private-workspace-search"
                type="search"
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="Cari catatan"
              />
              <label className="sr-only" htmlFor="private-workspace-filter">Filter status</label>
              <select
                id="private-workspace-filter"
                value={statusFilter}
                onChange={(event) => setStatusFilter(event.target.value)}
              >
                <option value="all">Semua status</option>
                {STATUS.map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}
              </select>
            </div>

            {loading ? (
              <p className="ale-private-workspace-empty" role="status">Memuat catatan...</p>
            ) : schemaUnavailable ? null : filteredRecords.length === 0 ? (
              <p className="ale-private-workspace-empty">
                {records.length ? 'Tidak ada catatan yang cocok dengan filter.' : 'Belum ada catatan. Mulai dengan menambahkan catatan pertama.'}
              </p>
            ) : (
              <ul className="ale-private-workspace-records">
                {filteredRecords.map((record) => (
                  <li className="ale-private-workspace-record" key={record.id}>
                    <div className="ale-private-workspace-record-head">
                      <h4>{record.title}</h4>
                      <span className={`ale-private-workspace-status ${record.status}`}>
                        {STATUS.find((item) => item.value === record.status)?.label}
                      </span>
                    </div>
                    {record.details && <p>{record.details}</p>}
                    <small>{tanggalLokal(record.dueDate)}</small>
                    <div className="ale-private-workspace-actions">
                      <button type="button" className="ale-private-workspace-button secondary" onClick={() => edit(record)}>
                        Ubah
                      </button>
                      <button type="button" className="ale-private-workspace-button danger" onClick={() => void remove(record)}>
                        Hapus
                      </button>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      )}
    </section>
  );
}
