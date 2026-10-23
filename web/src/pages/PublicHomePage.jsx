import React from 'react';
import '../styles/public-home.css';

const capabilities = [
  {
    number: '01',
    title: 'Rencanakan pembelajaran',
    description: 'Kelola perangkat ajar, tujuan pembelajaran, dan persiapan kelas dalam alur kerja yang lebih tertata.',
    icon: 'bi-journal-bookmark',
  },
  {
    number: '02',
    title: 'Dukung kegiatan kelas',
    description: 'Akses alat bantu untuk jurnal, kehadiran, kegiatan, dan koordinasi pembelajaran.',
    icon: 'bi-easel2',
  },
  {
    number: '03',
    title: 'Tinjau asesmen',
    description: 'Susun bank soal dan tinjau hasil belajar melalui fitur asesmen yang diaktifkan sekolah.',
    icon: 'bi-clipboard2-check',
  },
  {
    number: '04',
    title: 'Tetap terhubung',
    description: 'Buka ruang komunikasi dan kolaborasi sesuai peran serta akses akun yang diberikan.',
    icon: 'bi-chat-square-dots',
  },
];

const audiences = [
  ['Guru', 'Menyiapkan, menjalankan, dan merefleksikan pembelajaran.'],
  ['Sekolah', 'Mendukung pengelolaan kegiatan dan koordinasi tim.'],
  ['Siswa dan wali', 'Mengakses informasi belajar melalui fitur dan akun yang disediakan sekolah.'],
];

export default function PublicHomePage() {
  const lihatFitur = () => {
    document.getElementById('fitur')?.scrollIntoView({ behavior: 'smooth' });
  };

  return (
    <div className="public-home">
      <a className="public-home__skip" href="#konten">Lewati ke konten</a>
      <header className="public-home__header">
        <a className="public-home__brand" href="#/" aria-label="AI_nnoe, beranda">
          <img src="/logo-ale-mark.png" alt="" width="42" height="42" />
          <span>
            <strong>AI_nnoe</strong>
            <small>Learning Ecosystem</small>
          </span>
        </a>
        <nav className="public-home__nav" aria-label="Navigasi utama">
          <button type="button" onClick={lihatFitur}>Fitur</button>
          <a href="#alur">Cara kerja</a>
          <a className="public-home__login" href="#/login">Masuk akun <span aria-hidden="true">↗</span></a>
        </nav>
      </header>

      <main id="konten">
        <section className="public-home__hero" aria-labelledby="public-home-title">
          <div className="public-home__hero-copy">
            <p className="public-home__eyebrow"><span aria-hidden="true" /> RUANG KERJA DIGITAL PENDIDIKAN</p>
            <h1 id="public-home-title">Lebih terarah dalam setiap perjalanan belajar.</h1>
            <p className="public-home__lead">
              AI_nnoe menyatukan alat bantu perencanaan, pelaksanaan, asesmen, dan komunikasi
              agar pekerjaan sekolah terasa lebih tertata.
            </p>
            <div className="public-home__actions">
              <a className="public-home__button public-home__button--primary" href="#/login">
                Masuk ke ruang kerja <span aria-hidden="true">→</span>
              </a>
              <button className="public-home__button public-home__button--quiet" type="button" onClick={lihatFitur}>
                Kenali fiturnya
              </button>
            </div>
            <p className="public-home__note">Akses aplikasi diberikan melalui akun yang disediakan administrator sekolah.</p>
          </div>

          <div className="public-home__visual" aria-label="Ilustrasi ruang kerja pembelajaran">
            <div className="public-home__orbit public-home__orbit--one" />
            <div className="public-home__orbit public-home__orbit--two" />
            <div className="public-home__visual-card">
              <div className="public-home__visual-top">
                <span className="public-home__visual-mark"><img src="/logo-ale-mark.png" alt="" /></span>
                <span><strong>Ruang kerja</strong><small>Belajar · Bertumbuh · Berkolaborasi</small></span>
                <span className="public-home__status-dot" aria-label="Ilustrasi" />
              </div>
              <div className="public-home__visual-welcome">
                <span>Selamat datang di</span>
                <strong>ekosistem belajar</strong>
              </div>
              <div className="public-home__visual-grid" aria-hidden="true">
                <div><i className="bi bi-journal-text" /><span>Perencanaan</span></div>
                <div><i className="bi bi-easel2" /><span>Pelaksanaan</span></div>
                <div><i className="bi bi-clipboard2-check" /><span>Asesmen</span></div>
                <div><i className="bi bi-chat-square-dots" /><span>Kolaborasi</span></div>
              </div>
              <div className="public-home__visual-foot"><span /> Satu ruang, banyak kemungkinan.</div>
            </div>
            <span className="public-home__spark public-home__spark--one" aria-hidden="true">✳</span>
            <span className="public-home__spark public-home__spark--two" aria-hidden="true">✦</span>
          </div>
        </section>

        <section className="public-home__trust" aria-label="Prinsip layanan">
          <p>Dirancang untuk mendukung kerja pendidikan yang</p>
          <div><span>Terarah</span><span>Kolaboratif</span><span>Berpusat pada belajar</span></div>
        </section>

        <section className="public-home__section public-home__features" id="fitur" aria-labelledby="features-title">
          <div className="public-home__section-heading">
            <p className="public-home__eyebrow">SATU EKOSISTEM, ALUR YANG TERHUBUNG</p>
            <h2 id="features-title">Alat bantu untuk keseharian sekolah</h2>
            <p>Jelajahi ruang kerja yang dirancang mengikuti alur pembelajaran, dari persiapan hingga refleksi.</p>
          </div>
          <div className="public-home__feature-grid">
            {capabilities.map((item) => (
              <article className="public-home__feature" key={item.number}>
                <div className="public-home__feature-top">
                  <span className="public-home__feature-icon" aria-hidden="true"><i className={`bi ${item.icon}`} /></span>
                  <span>{item.number}</span>
                </div>
                <h3>{item.title}</h3>
                <p>{item.description}</p>
              </article>
            ))}
          </div>
          <p className="public-home__availability" role="note">
            Fitur dan data yang dapat digunakan bergantung pada aktivasi, konfigurasi, serta kesiapan layanan sekolah.
          </p>
        </section>

        <section className="public-home__journey" id="alur" aria-labelledby="journey-title">
          <div className="public-home__journey-intro">
            <p className="public-home__eyebrow">DIBANGUN UNTUK EKOSISTEM SEKOLAH</p>
            <h2 id="journey-title">Setiap peran, satu tujuan bersama.</h2>
            <p>Ruang kerja mengikuti kebutuhan warga sekolah dengan akses yang ditentukan oleh administrator.</p>
          </div>
          <div className="public-home__audience-list">
            {audiences.map(([title, description], index) => (
              <article className="public-home__audience" key={title}>
                <span>0{index + 1}</span>
                <div><h3>{title}</h3><p>{description}</p></div>
                <span className="public-home__audience-arrow" aria-hidden="true">↗</span>
              </article>
            ))}
          </div>
        </section>

        <section className="public-home__cta" aria-labelledby="cta-title">
          <div>
            <p className="public-home__eyebrow">MULAI DARI AKUN SEKOLAH ANDA</p>
            <h2 id="cta-title">Siap melanjutkan kegiatan belajar?</h2>
            <p>Masuk menggunakan akun yang sudah diberikan oleh administrator sekolah.</p>
          </div>
          <a className="public-home__button public-home__button--light" href="#/login">Masuk akun <span aria-hidden="true">→</span></a>
        </section>
      </main>

      <footer className="public-home__footer">
        <a className="public-home__brand public-home__brand--footer" href="#/" aria-label="AI_nnoe, kembali ke beranda">
          <img src="/logo-ale-mark.png" alt="" width="34" height="34" />
          <span><strong>AI_nnoe</strong><small>Learning Ecosystem</small></span>
        </a>
        <p>Ruang kerja digital untuk mendukung perjalanan belajar.</p>
        <div className="public-home__footer-links">
          <a href="#/privacy">Informasi privasi</a>
          <span>© AI_nnoe Learning Ecosystem</span>
          <span>Inisiatif oleh Raimundus Ciku Koten</span>
        </div>
      </footer>
    </div>
  );
}
