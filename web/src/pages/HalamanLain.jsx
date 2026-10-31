// web/src/pages/HalamanLain.jsx
import React from 'react';
import Ikon from '../components/Ikon.jsx';

export function TidakDitemukan() {
  return (
    <section className="ale-kartu ale-aksen-amber" aria-labelledby="ale-404-judul">
      <div className="ale-kosong">
        <Ikon nama="file" />
        <h2 id="ale-404-judul" className="ale-kartu-judul">Halaman tidak ditemukan</h2>
        <p><a href="#/dashboard">Kembali ke dashboard</a></p>
      </div>
    </section>
  );
}
