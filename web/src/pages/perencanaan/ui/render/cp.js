import { h } from '../dom.js';
import { t } from '../../i18n/index.js';
import { kopDokumen, blokTtd } from './umum.js';

export function renderCp(capaian, konteks) {
  const tanggal = Number.isFinite(Date.parse(capaian.source?.importedAt))
    ? new Intl.DateTimeFormat('id-ID', {
      dateStyle: 'medium',
      timeZone: 'UTC',
    }).format(new Date(capaian.source.importedAt))
    : '';
  return h('article', { class: 'dokumen dokumen-cp' },
    kopDokumen(konteks, `${t('cp.judul')} · ${capaian.mapel} · ${t('cp.fase', { fase: capaian.fase })}`),
    h('p', { class: 'meta' }, t('cp.sumber', { nama: capaian.source?.fileName || 'PDF' })),
    h('p', { class: 'meta' }, t('cp.kelasSasaran', {
      jenjang: konteks.jenjang?.toUpperCase() || '',
      kelas: konteks.kelas,
    })),
    tanggal ? h('p', { class: 'meta' }, t('cp.tanggalImpor', { tanggal })) : null,
    h('div', { class: 'daftar-cp' }, capaian.cp.map((item) => h('section', null,
      h('h2', null, item.elemen),
      h('p', null, item.cp)))),
    blokTtd(konteks));
}
