import React, { useEffect, useState } from 'react';
import { useAuth } from '../context/AuthContext.jsx';
import { isSchoolAdminRole } from '../services/roleAccess.js';
import { supabase } from '../lib/supabase.ts';
import '../styles/testimonial.css';

const BAHASA_POSITIF = /\b(membantu|bermanfaat|mudah|praktis|cepat|efisien|jelas|baik|bagus|puas|senang|terbantu|menghemat|meningkat|memudahkan|menyenangkan|terbaik)\b/i;
const BAHASA_NEGATIF = /\b(tidak|belum|kurang|buruk|sulit|gagal|kecewa|masalah|lambat|susah|ribet|mengecewakan)\b/i;
const pesanGalat = (error) => ({
  'permission-denied': 'Akses tidak diizinkan oleh aturan keamanan. Periksa peran dan sekolah Anda.',
  unavailable: 'Layanan testimoni sedang tidak tersedia. Coba lagi nanti.',
}[error?.code] || error?.message || 'Permintaan testimoni gagal.');

export default function TestimonialPage() {
  const { user, role, activeRole, tenantId, profile } = useAuth();
  const currentRole = activeRole || role;
  const [punya, setPunya] = useState(null);
  const [menunggu, setMenunggu] = useState([]);
  const [kutipan, setKutipan] = useState('');
  const [kutipanEdit, setKutipanEdit] = useState({});
  const [rating, setRating] = useState(5);
  const [anonim, setAnonim] = useState(false);
  const [status, setStatus] = useState('');
  const [sibuk, setSibuk] = useState(false);
  const admin = isSchoolAdminRole(currentRole);

  useEffect(() => {
    if (!user?.uid || !tenantId) return undefined;
    let hidup = true;
    async function muat() {
      try {
        const { data: ownSubmission, error: ownError } = await supabase
          .from('testimonial_submissions')
          .select('*')
          .eq('owner_id', user.uid)
          .maybeSingle();
        if (ownError) throw ownError;
        if (!hidup) return;
        setPunya(ownSubmission || false);

        if (admin) {
          const { data: pending, error: pendingError } = await supabase
            .from('testimonial_submissions')
            .select('id, display_name, role, quote, rating, submitted_at')
            .eq('tenant_id', tenantId)
            .eq('status', 'pending')
            .order('submitted_at', { ascending: true })
            .limit(100);
          if (pendingError) throw pendingError;
          if (hidup) {
            setMenunggu((pending || []).map((item) => ({
              ...item,
              displayName: item.display_name,
            })));
          }
        }
      } catch (error) {
        console.error('[testimoni] Gagal memuat kiriman atau antrean moderasi:', error);
        if (hidup) setStatus(pesanGalat(error));
      }
    }
    void muat();
    return () => { hidup = false; };
  }, [user?.uid, tenantId, admin]);

  async function kirim(event) {
    event.preventDefault();
    const quote = kutipan.trim().replace(/\s+/g, ' ');
    if (quote.length < 20 || quote.length > 500) {
      setStatus('Testimoni harus terdiri dari 20–500 karakter.');
      return;
    }
    if (rating < 4) {
      setStatus('Pilih pengalaman positif (4 atau 5 bintang) untuk dikirim sebagai testimoni.');
      return;
    }
    setSibuk(true);
    setStatus('');
    try {
      const data = {
        owner_id: user.uid,
        tenant_id: tenantId,
        display_name: anonim ? 'Pengguna AI_nnoe' : String(profile?.nama || user.user_metadata?.full_name || 'Pengguna').slice(0, 80),
        role,
        quote,
        rating,
        consent: true,
      };
      const { error } = await supabase
        .from('testimonial_submissions')
        .upsert(data, { onConflict: 'owner_id' });
      if (error) throw error;
      setPunya({ ...data, status: 'pending' });
      setStatus('Testimoni terkirim dan menunggu peninjauan admin sekolah. Naskah publik dapat diringkas agar lugas tanpa mengubah makna.');
      setKutipan('');
    } catch (error) {
      console.error('[testimoni] Gagal mengirim testimoni:', error);
      setStatus(pesanGalat(error));
    } finally {
      setSibuk(false);
    }
  }

  async function moderasi(item, keputusan) {
    const quoteFinal = String(kutipanEdit[item.id] ?? item.quote).trim().replace(/\s+/g, ' ');
    if (keputusan === 'published' &&
        (quoteFinal.length < 20 || quoteFinal.length > 300 ||
         !BAHASA_POSITIF.test(quoteFinal) || BAHASA_NEGATIF.test(quoteFinal))) {
      setStatus('Naskah publik harus lugas (20–300 karakter), memuat pengalaman positif, dan tidak memuat kalimat negatif.');
      return;
    }
    setSibuk(true);
    setStatus('');
    try {
      const { error } = await supabase.rpc('moderate_testimonial', {
        p_submission_id: item.id,
        p_decision: keputusan,
        p_quote_final: keputusan === 'published' ? quoteFinal : null,
      });
      if (error) throw error;
      setMenunggu((items) => items.filter((submission) => submission.id !== item.id));
      setStatus(keputusan === 'published' ? 'Testimoni telah dipublikasikan.' : 'Testimoni ditolak.');
    } catch (error) {
      console.error('[testimoni] Gagal memoderasi testimoni:', error);
      setStatus(pesanGalat(error));
    } finally {
      setSibuk(false);
    }
  }

  if (!user || !tenantId) {
    return <section className="ale-testimonials"><h2>Testimoni pengguna</h2><p>Masuk dengan akun sekolah untuk mengirim atau meninjau testimoni.</p></section>;
  }

  return (
    <main className="ale-testimonials">
      <header><p className="ale-testimonials-kicker">Pengalaman pengguna</p><h2>Testimoni</h2>
        <p>Testimoni yang dikirim hanya tampil setelah ditinjau. Penyuntingan publik dibuat singkat dan positif tanpa mengubah maksud pengguna.</p></header>
      {status && <p className="ale-testimonials-status" role="status">{status}</p>}
      {!admin && (
        <section className="ale-testimonials-card">
          <h3>Kirim testimoni Anda</h3>
          {punya && <p>Status kiriman: <strong>{punya.status === 'published' ? 'Dipublikasikan' : punya.status === 'rejected' ? 'Tidak dipublikasikan' : 'Menunggu peninjauan'}</strong></p>}
          {punya?.status === 'pending' && <p>Kiriman sebelumnya menunggu moderasi. Anda dapat mengirim versi terbaru di bawah ini.</p>}
          {punya?.status === 'published' && <p>Testimoni Anda telah dipublikasikan. Hubungi admin sekolah bila ingin memperbarui atau menarik persetujuan.</p>}
          {punya?.status !== 'published' && (
          <form onSubmit={kirim}>
            <label>Pengalaman (20–500 karakter)
              <textarea value={kutipan} onChange={(event) => setKutipan(event.target.value)} maxLength={500} required />
            </label>
            <label>Penilaian
              <select value={rating} onChange={(event) => setRating(Number(event.target.value))}>
                <option value="5">5 bintang — sangat baik</option>
                <option value="4">4 bintang — baik</option>
              </select>
            </label>
            <label className="ale-testimonials-check"><input type="checkbox" checked={anonim} onChange={(event) => setAnonim(event.target.checked)} /> Tampilkan sebagai “Pengguna AI_nnoe”</label>
            <p className="ale-testimonials-small">Dengan mengirim, Anda menyetujui kutipan yang telah ditinjau untuk ditampilkan secara publik. Data kontak tidak akan dipublikasikan.</p>
            <button type="submit" disabled={sibuk}>Kirim untuk ditinjau</button>
          </form>
          )}
        </section>
      )}
      {admin && (
        <section className="ale-testimonials-review">
          <h3>Antrean moderasi sekolah</h3>
          {!menunggu.length && <p>Tidak ada testimoni yang menunggu peninjauan.</p>}
          {menunggu.map((item) => (
            <article className="ale-testimonials-card" key={item.id}>
              <p><strong>{item.displayName}</strong> · {item.role} · {item.rating}/5</p>
              <blockquote>{item.quote}</blockquote>
              <label>Naskah publik yang lugas dan positif
                <textarea value={kutipanEdit[item.id] ?? item.quote} onChange={(event) => setKutipanEdit((current) => ({ ...current, [item.id]: event.target.value }))} maxLength={300} />
              </label>
              <div className="ale-testimonials-actions">
                <button type="button" disabled={sibuk} onClick={() => moderasi(item, 'published')}>Publikasikan</button>
                <button type="button" className="secondary" disabled={sibuk} onClick={() => moderasi(item, 'rejected')}>Tolak</button>
              </div>
            </article>
          ))}
        </section>
      )}
    </main>
  );
}
