import React from 'react';
import Ikon from '../components/Ikon.jsx';
import '../styles/ai-integrations.css';

const WORKFLOWS = [
  'Asisten AI',
  'Draf perencanaan pembelajaran',
  'Draf soal pada Bank Soal',
];

export default function AIIntegrationsPage() {
  return (
    <main className="ai-integrations" aria-labelledby="ai-integrations-title">
      <header className="ai-integrations__header">
        <p className="ai-integrations__eyebrow"><Ikon nama="settings" /> Pengaturan akun</p>
        <h1 id="ai-integrations-title">AI &amp; Layanan</h1>
        <p>AI_nnoe menjalankan seluruh fitur generatif melalui Ollama lokal pada perangkat Anda.</p>
      </header>

      <p className="ai-integrations__message is-warning" role="note">
        AI cloud dinonaktifkan. Prompt dan konteks pembelajaran tidak dikirim ke provider AI eksternal
        oleh aplikasi.
      </p>

      <section className="ai-integrations__card" aria-labelledby="ai-local-title">
        <h2 id="ai-local-title">AI_nnoe lokal (Ollama)</h2>
        <p>Alur yang menggunakan model generatif:</p>
        <ul>
          {WORKFLOWS.map((workflow) => <li key={workflow}>{workflow}</li>)}
        </ul>
        <p>
          Ollama dan model harus sudah terpasang dan berjalan pada perangkat ini. Prompt hanya
          dikirim oleh aplikasi ke endpoint localhost yang dikonfigurasi untuk akun ini di browser.
          Untuk memastikan runtime juga tidak mengirim permintaan ke cloud, aktifkan OLLAMA_NO_CLOUD=1
          pada Ollama dan mulai ulang.
        </p>
        <p>
          Untuk memilih model, mengatur timeout, atau menguji koneksi, buka Pengaturan Koneksi.
          Bank Soal mencoba model cadangan lokal jika model utama gagal atau hasilnya tidak lolos
          validasi. Pastikan kedua model sudah tersedia di Ollama; fitur lain tidak beralih otomatis
          ke model cadangan. Jika model yang diperlukan tidak tersedia, aplikasi menampilkan
          kesalahan dan tidak beralih ke cloud.
        </p>
      </section>
    </main>
  );
}
