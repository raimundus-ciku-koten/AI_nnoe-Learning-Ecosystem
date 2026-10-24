import React, { useState } from 'react';

export default function IntegrationConsentOnboarding({
  initialServices,
  canCancel,
  onCancel,
  onSave,
}) {
  const [selected, setSelected] = useState(() => new Set(initialServices));
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  function toggle(service, enabled) {
    setSelected((current) => {
      const next = new Set(current);
      if (enabled) next.add(service);
      else next.delete(service);
      return next;
    });
  }

  async function submit(event) {
    event.preventDefault();
    if (saving) return;
    setSaving(true);
    setError('');
    try {
      await onSave([...selected]);
    } catch (cause) {
      console.error('[integration-consent] Gagal menyimpan pilihan:', cause);
      setError(cause?.message || 'Pilihan integrasi tidak dapat disimpan.');
    } finally {
      setSaving(false);
    }
  }

  return (
    <main className="platform-tenants">
      <section className="platform-tenants-card" role="dialog" aria-modal="true" aria-labelledby="integration-consent-title">
        <p className="platform-tenants-kicker">Privasi · integrasi akun</p>
        <h1 id="integration-consent-title">Pilih layanan yang ingin Anda hubungkan</h1>
        <p>Pilihan ini dicatat untuk akun Anda. Tidak ada OAuth, token, API key, atau data layanan yang diminta otomatis. Setiap koneksi memerlukan tindakan dan persetujuan provider secara terpisah.</p>
        <form onSubmit={submit}>
          <fieldset disabled={saving}>
            <legend>Persetujuan layanan yang didukung</legend>
            {[
              ['drive', 'Google Drive', 'File dan vault milik akun Google Anda; izin hanya diminta saat Anda menekan Hubungkan Google.'],
              ['sheets', 'Google Sheets', 'Pembuatan spreadsheet meminta cakupan Sheets secara terpisah.'],
              ['meet', 'Google Meet', 'Pembuatan ruang Meet meminta cakupan Meet hanya saat Anda membuat rapat.'],
              ['calendar', 'Google Calendar', 'Pembuatan acara langsung meminta cakupan Calendar setelah Anda menekan tombol buat acara.'],
              ['tasks', 'Google Tasks', 'Pembuatan tugas meminta cakupan Tasks hanya saat Anda menyimpan tugas.'],
            ].map(([service, label, description]) => (
              <label key={service} style={{ display: 'grid', gridTemplateColumns: 'auto 1fr', gap: '.25rem .65rem', margin: '1rem 0' }}>
                <input
                  type="checkbox"
                  checked={selected.has(service)}
                  onChange={(event) => toggle(service, event.target.checked)}
                  aria-describedby={`integration-${service}-description`}
                />
                <span><strong>{label}</strong><br /><small id={`integration-${service}-description`}>{description}</small></span>
              </label>
            ))}
          </fieldset>
          <section aria-labelledby="integration-not-available-title">
            <h2 id="integration-not-available-title">Belum tersedia</h2>
            <ul>
              <li>Gmail: akses tidak diminta dan tidak ada cakupan Gmail yang digunakan.</li>
              <li>Gemini, DeepSeek, Groq, Claude, dan Canva: belum diaktifkan untuk koneksi personal. Jangan masukkan API key; fitur AI eksternal tetap nonaktif. Free tier provider dapat berubah dan bisa memiliki kuota atau biaya.</li>
            </ul>
          </section>
          <p role="note">Menyimpan pilihan kosong berarti Anda melanjutkan tanpa memberi persetujuan integrasi apa pun. Anda dapat mengubah pilihan ini melalui menu profil.</p>
          {error && <p role="alert">{error}</p>}
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '.75rem' }}>
            <button type="submit" disabled={saving}>{saving ? 'Menyimpan…' : 'Simpan pilihan & lanjutkan'}</button>
            {canCancel && <button type="button" className="is-secondary" onClick={onCancel} disabled={saving}>Batal</button>}
          </div>
        </form>
      </section>
    </main>
  );
}
