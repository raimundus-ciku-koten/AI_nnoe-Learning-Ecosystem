import React, { useMemo, useState } from 'react';

const LEVELS = {
    tk: {
        label: 'TK',
        title: 'Rapor Perkembangan Anak',
        subtitle: 'Contoh struktur penilaian perkembangan anak usia dini.',
        summary: 'Menyusun deskripsi capaian pada aspek perkembangan melalui observasi, portofolio, dan catatan pendampingan.',
        fields: [
            { label: 'Nama peserta didik', value: 'Aisyah Putri' },
            { label: 'NISN', value: '0001234567' },
            { label: 'Kelas', value: 'TK B' },
            { label: 'Semester', value: 'Genap 2024/2025' },
        ],
        areas: [
            'Agama dan akhlak mulia',
            'Sosial emosional',
            'Bahasa',
            'Kognitif',
            'Motorik halus dan kasar',
            'Seni dan kreativitas',
        ],
        rows: [
            { mapel: 'Agama dan Akhlak', predikat: 'Berkembang sangat baik', deskripsi: 'Menyebutkan ibadah dan perilaku sopan dengan konsisten.' },
            { mapel: 'Bahasa', predikat: 'Berkembang baik', deskripsi: 'Mampu berkomunikasi sederhana, mengikuti instruksi, dan memahami cerita.' },
            { mapel: 'Kognitif', predikat: 'Berkembang sesuai harapan', deskripsi: 'Mampu mengenal angka, huruf, dan pola sederhana dengan bimbingan.' },
            { mapel: 'Motorik', predikat: 'Berkembang sangat baik', deskripsi: 'Menggunakan alat tulis dan koordinasi gerak dengan rapi.' },
            { mapel: 'Sosial-emosional', predikat: 'Berkembang baik', deskripsi: 'Bekerja sama, mengikuti aturan, dan menunjukkan sikap mandiri.' },
        ],
        notes: 'Catatan wali kelas: Anak menunjukkan semangat belajar yang tinggi dan perlu dukungan pada keterampilan komunikasi lisan.',
        closing: 'Keputusan: Lanjut ke jenjang berikutnya dengan rekomendasi penguatan dalam kemampuan komunikasi dan sosial.',
    },
    sd: {
        label: 'SD',
        title: 'Rapor Sekolah Dasar',
        subtitle: 'Contoh struktur yang menekankan capaian kompetensi dan sikap.',
        summary: 'Menilai sikap, pengetahuan, keterampilan, kehadiran, serta catatan pengembangan peserta didik secara holistik.',
        fields: [
            { label: 'Nama peserta didik', value: 'Rafi Pratama' },
            { label: 'NISN', value: '0002345678' },
            { label: 'Kelas', value: 'VI A' },
            { label: 'Semester', value: 'Genap 2024/2025' },
        ],
        areas: [
            'Aqidah dan akhlak',
            'Pendidikan Pancasila',
            'Bahasa Indonesia',
            'Matematika',
            'IPA',
            'IPS',
            'Seni budaya',
            'Olahraga',
        ],
        rows: [
            { mapel: 'Pendidikan Pancasila', predikat: 'A', deskripsi: 'Menunjukkan sikap toleran, disiplin, dan tanggung jawab dalam kegiatan kelas.' },
            { mapel: 'Bahasa Indonesia', predikat: 'A', deskripsi: 'Mampu memahami teks, menulis dengan struktur yang baik, dan berkomunikasi secara santun.' },
            { mapel: 'Matematika', predikat: 'A', deskripsi: 'Memahami operasi bilangan dan pemecahan masalah dengan tepat dan konsisten.' },
            { mapel: 'IPA', predikat: 'B+', deskripsi: 'Mampu menjelaskan konsep dasar sains serta melakukan pengamatan sederhana.' },
            { mapel: 'IPS', predikat: 'A', deskripsi: 'Memahami lingkungan sosial dan ekonomi serta menumbuhkan kepedulian terhadap masyarakat.' },
        ],
        notes: 'Catatan wali kelas: Peserta didik aktif, berpartisipasi dalam pembelajaran, dan menunjukkan karakter kepemimpinan positif.',
        closing: 'Keputusan: Naik kelas dengan predikat sangat baik dan rekomendasi penguatan literasi numerasi.',
    },
    smp: {
        label: 'SMP',
        title: 'Rapor Sekolah Menengah Pertama',
        subtitle: 'Contoh struktur yang menyeimbangkan sikap, pengetahuan, dan keterampilan.',
        summary: 'Menampilkan hasil belajar per mata pelajaran, deskripsi capaian, dan keputusan kenaikan/kelulusan berdasarkan kerangka pemerintah.',
        fields: [
            { label: 'Nama peserta didik', value: 'Nadia Safira' },
            { label: 'NISN', value: '0003456789' },
            { label: 'Kelas', value: 'IX D' },
            { label: 'Semester', value: 'Genap 2024/2025' },
        ],
        areas: [
            'Pendidikan Agama',
            'Pendidikan Pancasila',
            'Bahasa Indonesia',
            'Bahasa Inggris',
            'Matematika',
            'IPA',
            'IPS',
            'Teknologi Informasi',
            'Prakarya',
        ],
        rows: [
            { mapel: 'Bahasa Indonesia', predikat: 'A', deskripsi: 'Menyampaikan gagasan secara runtut, menulis argumentasi dengan struktur yang kuat, dan membaca kritis.' },
            { mapel: 'Matematika', predikat: 'A', deskripsi: 'Menyelesaikan soal kontekstual dengan metode yang tepat serta menunjukkan logika analitis yang baik.' },
            { mapel: 'IPA', predikat: 'A', deskripsi: 'Menguasai konsep ilmiah dasar dan mampu merancang percobaan sederhana secara sistematis.' },
            { mapel: 'Bahasa Inggris', predikat: 'B+', deskripsi: 'Komunikasi lisan dan tulisan sudah baik, diperlukan penguatan penggunaan kosakata akademik.' },
            { mapel: 'Pendidikan Pancasila', predikat: 'A', deskripsi: 'Menunjukkan sikap tanggung jawab, kebhinekaan, dan kepedulian sosial yang konsisten.' },
        ],
        notes: 'Catatan wali kelas: Peserta didik menunjukkan disiplin tinggi, partisipasi aktif, dan perkembangan karakter yang positif.',
        closing: 'Keputusan: Lulus dari jenjang SMP dengan predikat sangat baik dan kesiapan untuk jenjang SMA.',
    },
    sma: {
        label: 'SMA',
        title: 'Rapor Sekolah Menengah Atas',
        subtitle: 'Contoh struktur capaian pembelajaran, sikap, dan keputusan kelulusan.',
        summary: 'Menyajikan hasil belajar per mata pelajaran, kompetensi, serta catatan perkembangan peserta didik untuk penjurusan dan kelulusan.',
        fields: [
            { label: 'Nama peserta didik', value: 'Dewi Lestari' },
            { label: 'NISN', value: '0004567890' },
            { label: 'Kelas', value: 'XII MIPA 2' },
            { label: 'Semester', value: 'Genap 2024/2025' },
        ],
        areas: [
            'Pendidikan Agama',
            'Pendidikan Pancasila',
            'Matematika',
            'Biologi',
            'Fisika',
            'Kimia',
            'Bahasa Inggris',
            'Informatika',
            'Ekstrakurikuler',
        ],
        rows: [
            { mapel: 'Matematika', predikat: 'A', deskripsi: 'Menunjukkan pemahaman konsep dan kemampuan analisis problem solving yang tinggi dalam konteks nyata.' },
            { mapel: 'Biologi', predikat: 'A', deskripsi: 'Mampu menjelaskan prinsip ilmiah secara kritis dan menghubungkan konsep dengan kajian lingkungan.' },
            { mapel: 'Bahasa Inggris', predikat: 'A', deskripsi: 'Menggunakan bahasa Inggris secara efektif dalam presentasi dan tulisan akademik.' },
            { mapel: 'Informatika', predikat: 'A', deskripsi: 'Memiliki kemampuan berpikir komputasional, analitis, dan kreatif dalam pemecahan masalah.' },
            { mapel: 'Pendidikan Pancasila', predikat: 'A', deskripsi: 'Menunjukkan sikap nasionalis, integritas, dan kepedulian sosial dalam kegiatan sekolah.' },
        ],
        notes: 'Catatan wali kelas: Peserta didik aktif dalam akademik dan organisasi, serta memiliki potensi yang sangat baik untuk melanjutkan studi.',
        closing: 'Keputusan: Lulus dengan predikat sangat baik dan berpotensi melanjutkan ke jenjang yang lebih tinggi sesuai minat.',
    },
};

export default function ReportCardPage() {
    const [jenjang, setJenjang] = useState('sd');
    const data = useMemo(() => LEVELS[jenjang] || LEVELS.sd, [jenjang]);

    return (
        <main style={{ display: 'grid', gap: '1.25rem', padding: '1.25rem 0' }}>
            <section style={{ background: '#f8fafc', border: '1px solid #d9e2f2', borderRadius: 16, padding: 20 }}>
                <p style={{ margin: 0, fontSize: 12, letterSpacing: 1.4, textTransform: 'uppercase', color: '#2563eb', fontWeight: 700 }}>
                    Format rapor pemerintah terbaru
                </p>
                <h1 style={{ margin: '0.4rem 0 0.5rem', fontSize: '2rem', color: '#102a43' }}>Rapor</h1>
                <p style={{ margin: 0, color: '#3b4a5a' }}>
                    Pratinjau struktur rapor untuk tiap jenjang. Sesuaikan isi dan format dengan kebijakan sekolah serta ketentuan yang berlaku.
                </p>
            </section>

            <section
                role="note"
                aria-label="Pemberitahuan data simulasi"
                style={{ background: '#fffbeb', border: '1px solid #fcd34d', borderRadius: 12, padding: '0.9rem 1rem', color: '#78350f' }}
            >
                <strong>Pratinjau saja — seluruh identitas, nilai, kehadiran, dan catatan di bawah adalah data simulasi.</strong>
                <p style={{ margin: '0.35rem 0 0' }}>Halaman ini belum terhubung ke data peserta didik dan bukan dokumen rapor resmi.</p>
            </section>

            <section style={{ display: 'flex', flexWrap: 'wrap', gap: '0.65rem' }} aria-label="Pemilih jenjang rapor">
                {Object.entries(LEVELS).map(([key, item]) => (
                    <button
                        key={key}
                        type="button"
                        onClick={() => setJenjang(key)}
                        style={{
                            border: '1px solid #cbd5e1',
                            borderRadius: 999,
                            padding: '0.7rem 1rem',
                            background: jenjang === key ? '#1d4ed8' : '#ffffff',
                            color: jenjang === key ? '#ffffff' : '#0f172a',
                            fontWeight: 700,
                            cursor: 'pointer',
                        }}
                    >
                        {item.label}
                    </button>
                ))}
            </section>

            <section style={{ background: '#ffffff', border: '1px solid #dfe8f2', borderRadius: 18, padding: 20, boxShadow: '0 12px 28px rgba(15, 23, 42, 0.05)' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '1rem', flexWrap: 'wrap' }}>
                    <div>
                        <p style={{ margin: 0, color: '#1d4ed8', fontWeight: 700, letterSpacing: 1.2, textTransform: 'uppercase', fontSize: 12 }}>{data.label}</p>
                        <h2 style={{ margin: '0.3rem 0 0', fontSize: '1.6rem', color: '#0f172a' }}>{data.title}</h2>
                    </div>
                    <span style={{ background: '#eff6ff', color: '#1d4ed8', borderRadius: 999, padding: '0.5rem 0.8rem', fontWeight: 700 }}>
                        {data.subtitle}
                    </span>
                </div>

                <p style={{ marginTop: '1rem', color: '#475569', lineHeight: 1.7 }}>{data.summary}</p>

                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '0.9rem', marginTop: '1rem' }}>
                    {data.fields.map((field) => (
                        <div key={field.label} style={{ background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: 12, padding: '0.8rem 0.9rem' }}>
                            <p style={{ margin: 0, fontSize: 12, color: '#64748b', textTransform: 'uppercase', letterSpacing: 0.7 }}>{field.label}</p>
                            <strong style={{ display: 'block', marginTop: 8, color: '#0f172a' }}>{field.value}</strong>
                        </div>
                    ))}
                </div>

                <div style={{ marginTop: '1.2rem' }}>
                    <h3 style={{ marginBottom: '0.75rem', color: '#102a43' }}>Aspek utama penilaian</h3>
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.55rem' }}>
                        {data.areas.map((area) => (
                            <span key={area} style={{ background: '#e2e8f0', color: '#1e293b', borderRadius: 999, padding: '0.45rem 0.7rem', fontWeight: 600 }}>
                                {area}
                            </span>
                        ))}
                    </div>
                </div>

                <div style={{ marginTop: '1.25rem', overflowX: 'auto' }}>
                    <table style={{ width: '100%', borderCollapse: 'collapse', border: '1px solid #dfe8f2', borderRadius: 12, overflow: 'hidden' }}>
                        <thead>
                            <tr style={{ background: '#eff6ff' }}>
                                <th style={{ textAlign: 'left', padding: '0.8rem 0.75rem', color: '#0f172a' }}>Mata pelajaran / aspek</th>
                                <th style={{ textAlign: 'left', padding: '0.8rem 0.75rem', color: '#0f172a' }}>Predikat</th>
                                <th style={{ textAlign: 'left', padding: '0.8rem 0.75rem', color: '#0f172a' }}>Deskripsi capaian</th>
                            </tr>
                        </thead>
                        <tbody>
                            {data.rows.map((row) => (
                                <tr key={row.mapel} style={{ borderTop: '1px solid #edf2f7' }}>
                                    <td style={{ padding: '0.8rem 0.75rem', color: '#0f172a', fontWeight: 600 }}>{row.mapel}</td>
                                    <td style={{ padding: '0.8rem 0.75rem', color: '#1d4ed8', fontWeight: 700 }}>{row.predikat}</td>
                                    <td style={{ padding: '0.8rem 0.75rem', color: '#334155', lineHeight: 1.6 }}>{row.deskripsi}</td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '1rem', marginTop: '1.25rem' }}>
                    <div style={{ background: '#f8fafc', border: '1px solid #dfe8f2', borderRadius: 12, padding: '1rem' }}>
                        <p style={{ margin: 0, color: '#64748b', fontWeight: 700, textTransform: 'uppercase', letterSpacing: 1, fontSize: 11 }}>Kehadiran</p>
                        <p style={{ margin: '0.6rem 0 0', color: '#0f172a', fontSize: '1.1rem', fontWeight: 700 }}>96.5%</p>
                    </div>
                    <div style={{ background: '#f8fafc', border: '1px solid #dfe8f2', borderRadius: 12, padding: '1rem' }}>
                        <p style={{ margin: 0, color: '#64748b', fontWeight: 700, textTransform: 'uppercase', letterSpacing: 1, fontSize: 11 }}>Perilaku</p>
                        <p style={{ margin: '0.6rem 0 0', color: '#0f172a', fontSize: '1.1rem', fontWeight: 700 }}>Sangat baik</p>
                    </div>
                    <div style={{ background: '#f8fafc', border: '1px solid #dfe8f2', borderRadius: 12, padding: '1rem' }}>
                        <p style={{ margin: 0, color: '#64748b', fontWeight: 700, textTransform: 'uppercase', letterSpacing: 1, fontSize: 11 }}>Keputusan</p>
                        <p style={{ margin: '0.6rem 0 0', color: '#0f172a', fontSize: '1.1rem', fontWeight: 700 }}>Lulus / naik kelas</p>
                    </div>
                </div>

                <div style={{ marginTop: '1.25rem', display: 'grid', gap: '0.9rem' }}>
                    <div style={{ background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: 12, padding: '0.9rem 1rem' }}>
                        <p style={{ margin: 0, fontWeight: 700, color: '#0f172a' }}>Catatan wali kelas</p>
                        <p style={{ margin: '0.55rem 0 0', color: '#334155', lineHeight: 1.6 }}>{data.notes}</p>
                    </div>
                    <div style={{ background: '#ecfeff', border: '1px solid #a5f3fc', borderRadius: 12, padding: '0.9rem 1rem' }}>
                        <p style={{ margin: 0, fontWeight: 700, color: '#0f172a' }}>Kesimpulan</p>
                        <p style={{ margin: '0.55rem 0 0', color: '#0f172a', lineHeight: 1.6 }}>{data.closing}</p>
                    </div>
                </div>
            </section>
        </main>
    );
}
