import React, { useState } from 'react';
import { getAssignedRoleChoices } from '../services/roleAccess.js';
import { LABEL_PERAN } from '../ui.js';
import '../styles/platform-tenants.css';

export default function RoleAccessGate({ roles, onSelectRole, onLogout }) {
  const choices = getAssignedRoleChoices(roles);
  const [busyRole, setBusyRole] = useState('');
  const [error, setError] = useState('');

  async function pilihPeran(role) {
    if (busyRole) return;
    setBusyRole(role);
    setError('');
    try {
      await onSelectRole(role);
    } catch (selectionError) {
      console.error('[role-access] Gagal mengaktifkan peran akun:', selectionError);
      setError(selectionError instanceof Error
        ? selectionError.message
        : 'Peran belum dapat diaktifkan. Coba lagi atau hubungi administrator.');
      setBusyRole('');
    }
  }

  return (
    <main className="platform-tenants" aria-labelledby="role-access-title">
      <section className="platform-tenants-card">
        <h1 id="role-access-title">
          {choices.length
            ? 'Pilih peran kerja Anda'
            : 'Peran akun belum tersedia'}
        </h1>
        <p>
          {choices.length
            ? 'Menu akan ditampilkan setelah server mengesahkan peran yang dipilih.'
            : 'Menu tidak dapat ditampilkan sampai administrator menetapkan peran yang sah pada akun ini.'}
        </p>
        {error && <p className="platform-tenants-error" role="alert">{error}</p>}
        {choices.length > 0 && (
          <div className="platform-tenants-toolbar" aria-label="Peran yang tersedia">
            {choices.map((role) => (
              <button
                key={role}
                className="platform-tenants-button"
                type="button"
                onClick={() => void pilihPeran(role)}
                disabled={Boolean(busyRole)}
              >
                {busyRole === role
                  ? 'Memverifikasi peran…'
                  : `Lanjut sebagai ${LABEL_PERAN[role] || role}`}
              </button>
            ))}
          </div>
        )}
        {onLogout && (
          <button
            className="platform-tenants-button secondary"
            type="button"
            onClick={() => void onLogout()}
            disabled={Boolean(busyRole)}
          >
            Keluar dari akun
          </button>
        )}
      </section>
    </main>
  );
}
