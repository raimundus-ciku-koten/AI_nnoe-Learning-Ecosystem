import { describe, expect, it } from 'vitest';
import { buatKerangkaCatatan } from './teacherWorkspaceTemplates.js';

describe('kerangka catatan ruang kerja guru', () => {
  it('menyediakan kerangka khusus untuk semua kelompok submenu guru', () => {
    const requiredHeadings = {
      pelaksanaan: 'Bukti keterlaksanaan:',
      asesmen: 'Ringkasan temuan tanpa identitas siswa:',
      pemantauan: 'Pengamatan yang relevan tanpa identitas pribadi:',
      refleksi: 'Tantangan dan kemungkinan penyebab:',
      laporan: 'Periode dan cakupan catatan:',
      kolaborasi: 'Kesepakatan atau keputusan:',
      pengaturan: 'Tindak lanjut melalui pengaturan resmi:',
    };

    for (const [group, heading] of Object.entries(requiredHeadings)) {
      expect(buatKerangkaCatatan(group, 'Catatan uji').isi, group).toContain(heading);
    }
  });

  it('menyediakan kerangka umum dan judul yang tidak kosong untuk masukan kosong', () => {
    const template = buatKerangkaCatatan('lainnya', '   ');
    expect(template.isi).toContain('Tindak lanjut:');
    expect(template.judul).toBe('Catatan kerja — catatan');
  });

  it('memilih kerangka yang spesifik untuk aktivitas saat tersedia', () => {
    expect(buatKerangkaCatatan('asesmen', 'Diagnostik', '/asesmen/diagnostik').isi)
      .toContain('Tujuan pemetaan awal:');
    expect(buatKerangkaCatatan('asesmen', 'Remedial', '/asesmen/remedial').isi)
      .toContain('Strategi remedial atau pengayaan:');
    expect(buatKerangkaCatatan('pelaksanaan', 'Jurnal', '/pelaksanaan/jurnal').isi)
      .toContain('Kegiatan pembuka, inti, dan penutup:');
    expect(buatKerangkaCatatan('asesmen', 'Formatif', '/asesmen/path-tidak-dikenal').isi)
      .toContain('Tujuan dan kriteria asesmen:');
  });
});
