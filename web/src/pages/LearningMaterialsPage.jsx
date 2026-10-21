import React, { useEffect, useRef, useState } from 'react';
import * as pdfjs from 'pdfjs-dist';
import pdfWorkerUrl from 'pdfjs-dist/build/pdf.worker.min.mjs?url';
import { renderAsync as renderDocx } from 'docx-preview';
import { useAuth } from '../context/AuthContext.jsx';
import {
  daftarMateriBelajar,
  hapusMateriBelajar,
  unggahMateriBelajar,
  urlMateriBelajar,
} from '../services/learningMaterials.js';
import '../styles/learning-materials.css';

pdfjs.GlobalWorkerOptions.workerSrc = pdfWorkerUrl;

function PembacaMateri({ material, onClose }) {
  const canvasRef = useRef(null);
  const docxRef = useRef(null);
  const docxPages = useRef([]);
  const pdfDocumentRef = useRef(null);
  const [page, setPage] = useState(1);
  const [pageCount, setPageCount] = useState(1);
  const [readerReady, setReaderReady] = useState(false);
  const [error, setError] = useState('');
  const isPdf = material.mime_type === 'application/pdf';

  useEffect(() => {
    let active = true;
    setPage(1);
    setPageCount(1);
    setReaderReady(false);
    setError('');

    async function load() {
      try {
        const url = await urlMateriBelajar(material.storage_path);
        const response = await fetch(url);
        if (!response.ok) throw new Error(`Berkas tidak dapat dimuat (HTTP ${response.status}).`);
        const bytes = await response.arrayBuffer();
        if (!active) return;
        if (isPdf) {
          const task = pdfjs.getDocument({ data: bytes, isEvalSupported: false, stopAtErrors: true });
          pdfDocumentRef.current = await task.promise;
          if (!active) return;
          setPageCount(pdfDocumentRef.current.numPages);
          setReaderReady(true);
        } else {
          if (!docxRef.current) throw new Error('Area pembaca Word tidak tersedia.');
          await renderDocx(bytes, docxRef.current, undefined, {
            breakPages: true,
            ignoreWidth: true,
            ignoreHeight: false,
            className: 'ale-docx-document',
          });
          docxPages.current = [...docxRef.current.querySelectorAll('.docx-wrapper > section')];
          if (!docxPages.current.length) {
            docxPages.current = [...docxRef.current.children];
          }
          if (!docxPages.current.length) throw new Error('Halaman Word tidak berhasil dirender.');
          setPageCount(docxPages.current.length);
          setReaderReady(true);
        }
      } catch (loadError) {
        if (active) setError(loadError.message || 'Materi tidak dapat dibuka.');
      }
    }

    void load();
    return () => {
      active = false;
      if (pdfDocumentRef.current) void pdfDocumentRef.current.destroy();
      pdfDocumentRef.current = null;
      docxPages.current = [];
      if (docxRef.current) docxRef.current.replaceChildren();
    };
  }, [isPdf, material.id, material.storage_path]);

  useEffect(() => {
    if (!isPdf || !readerReady || !canvasRef.current) return undefined;
    let active = true;
    let renderTask;
    async function renderPage() {
      try {
        const pdfPage = await pdfDocumentRef.current?.getPage(page);
        if (!active || !pdfPage) return;
        const baseViewport = pdfPage.getViewport({ scale: 1 });
        const scale = Math.min(1.5, 1100 / baseViewport.width);
        const viewport = pdfPage.getViewport({ scale });
        const canvas = canvasRef.current;
        canvas.width = viewport.width;
        canvas.height = viewport.height;
        renderTask = pdfPage.render({ canvas, viewport });
        await renderTask.promise;
      } catch (renderError) {
        if (active) setError(renderError.message || 'Halaman PDF gagal ditampilkan.');
      }
    }
    void renderPage();
    return () => {
      active = false;
      renderTask?.cancel();
    };
  }, [isPdf, material.id, material.storage_path, page, pageCount, readerReady]);

  useEffect(() => {
    docxPages.current.forEach((element, index) => {
      element.hidden = index !== page - 1;
    });
  }, [page, pageCount]);

  return (
    <section className="ale-material-reader" aria-label={`Pembaca ${material.title}`}>
      <header className="ale-material-reader-toolbar">
        <div>
          <h2>{material.title}</h2>
          <p>{material.subject} · Kelas {material.kelas} · {page} / {pageCount}</p>
        </div>
        <div className="ale-material-reader-actions">
          <button type="button" disabled={page <= 1} onClick={() => setPage((value) => value - 1)}>Sebelumnya</button>
          <button type="button" disabled={page >= pageCount} onClick={() => setPage((value) => value + 1)}>Berikutnya</button>
          <button type="button" className="is-secondary" onClick={onClose}>Tutup</button>
        </div>
      </header>
      {error && <p className="ale-material-error" role="alert">{error}</p>}
      {isPdf
        ? <div className="ale-material-page"><canvas ref={canvasRef} aria-label={`Halaman ${page} PDF`} /></div>
        : <div className="ale-material-page ale-material-docx" ref={docxRef} />}
    </section>
  );
}

export default function LearningMaterialsPage() {
  const { user, role, tenantId } = useAuth();
  const [materials, setMaterials] = useState([]);
  const [active, setActive] = useState(null);
  const [file, setFile] = useState(null);
  const [form, setForm] = useState({ title: '', subject: '', kelas: '' });
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const canUpload = role === 'guru';

  async function refresh() {
    if (!tenantId) {
      setMaterials([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    setError('');
    try {
      setMaterials(await daftarMateriBelajar(tenantId));
    } catch (loadError) {
      console.error('[learning-materials] Gagal memuat materi:', loadError);
      setError('Daftar materi tidak dapat dimuat. Periksa koneksi dan akses tenant.');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { void refresh(); }, [tenantId]);

  async function upload(event) {
    event.preventDefault();
    const formElement = event.currentTarget;
    if (!file || !tenantId || !user?.uid || busy) {
      setError('Pilih berkas dan pastikan akun guru terhubung ke sekolah.');
      return;
    }
    setBusy(true);
    setError('');
    setNotice('');
    try {
      const saved = await unggahMateriBelajar(tenantId, user.uid, form, file);
      setMaterials((current) => [saved, ...current].slice(0, 100));
      setForm({ title: '', subject: '', kelas: '' });
      setFile(null);
      formElement.reset();
      setNotice('Materi tersedia bagi siswa dan staf di tenant sekolah ini.');
    } catch (uploadError) {
      console.error('[learning-materials] Gagal mengunggah materi:', uploadError);
      setError(uploadError.message || 'Materi tidak dapat diunggah.');
    } finally {
      setBusy(false);
    }
  }

  async function remove(material) {
    if (busy || !window.confirm(`Hapus materi "${material.title}"?`)) return;
    setBusy(true);
    setError('');
    try {
      await hapusMateriBelajar(material);
      setMaterials((current) => current.filter((item) => item.id !== material.id));
      if (active?.id === material.id) setActive(null);
      setNotice('Materi berhasil dihapus.');
    } catch (removeError) {
      console.error('[learning-materials] Gagal menghapus materi:', removeError);
      setError(removeError.message || 'Materi tidak dapat dihapus.');
    } finally {
      setBusy(false);
    }
  }

  if (!tenantId) {
    return (
      <main className="ale-materials-page">
        <section className="ale-material-card" role="status">
          <h1>Materi Digital</h1>
          <p>Akun ini belum terhubung dengan sekolah. Ajukan atau hubungi administrator sekolah.</p>
        </section>
      </main>
    );
  }

  return (
    <main className="ale-materials-page">
      <header className="ale-materials-heading">
        <p>Ruang belajar · dokumen tenant privat</p>
        <h1>Materi Digital</h1>
        <span>PDF dan Word DOCX dibaca per halaman seperti flipbook. Berkas hanya tersedia bagi anggota tenant sekolah.</span>
      </header>

      {error && <p className="ale-material-error" role="alert">{error}</p>}
      {notice && <p className="ale-material-notice" role="status">{notice}</p>}

      {canUpload && (
        <section className="ale-material-card">
          <h2>Kirim materi untuk siswa</h2>
          <form className="ale-material-upload" onSubmit={upload}>
            <label>Judul materi
              <input required maxLength={160} value={form.title} onChange={(event) => setForm({ ...form, title: event.target.value })} />
            </label>
            <label>Mata pelajaran
              <input required maxLength={80} value={form.subject} onChange={(event) => setForm({ ...form, subject: event.target.value })} />
            </label>
            <label>Kelas
              <input required maxLength={30} value={form.kelas} onChange={(event) => setForm({ ...form, kelas: event.target.value })} />
            </label>
            <label className="ale-material-file">Berkas PDF atau Word DOCX (maks. 20 MB)
              <input required type="file" accept=".pdf,.docx,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document" onChange={(event) => setFile(event.target.files?.[0] || null)} />
            </label>
            <button type="submit" disabled={busy}>{busy ? 'Mengunggah…' : 'Unggah dan bagikan'}</button>
          </form>
        </section>
      )}

      <section className="ale-material-card" aria-labelledby="ale-material-list-title">
        <div className="ale-material-list-heading">
          <h2 id="ale-material-list-title">Perpustakaan sekolah</h2>
          <button type="button" className="is-secondary" onClick={() => void refresh()} disabled={loading || busy}>
            {loading ? 'Memuat…' : 'Muat ulang'}
          </button>
        </div>
        {loading && <p role="status">Memuat materi…</p>}
        {!loading && materials.length === 0 && <p>Belum ada materi yang dibagikan.</p>}
        <ul className="ale-material-list">
          {materials.map((material) => (
            <li key={material.id}>
              <div>
                <strong>{material.title}</strong>
                <span>{material.subject} · Kelas {material.kelas} · {material.file_name}</span>
              </div>
              <div className="ale-material-actions">
                <button type="button" onClick={() => setActive(material)}>Baca seperti flipbook</button>
                {canUpload && material.owner_id === user?.uid && (
                  <button type="button" className="is-secondary" disabled={busy} onClick={() => void remove(material)}>Hapus</button>
                )}
              </div>
            </li>
          ))}
        </ul>
      </section>
      {active && <PembacaMateri material={active} onClose={() => setActive(null)} />}
    </main>
  );
}
