import { h } from './dom.js';
import { normKode, ratakanTp } from '../engine/prota.js';
import { t } from '../i18n/index.js';

const LEVEL = Object.freeze([
  ['perluBimbingan', 'kktp.levelPerluBimbingan'],
  ['cukup', 'kktp.levelCukup'],
  ['baik', 'kktp.levelBaik'],
  ['sangatBaik', 'kktp.levelSangatBaik'],
]);
const KATEGORI_RUBRIK_UMUM = Object.freeze([
  ['aspek', 'kktp.aspek'],
  ['belumBerkembang', 'kktp.kategoriBelum'],
  ['berkembangSesuaiHarapan', 'kktp.kategoriBerkembangSesuai'],
  ['mahir', 'kktp.kategoriMahir'],
]);
const PERLU_KONFIRMASI = 'PERLU KONFIRMASI';

function textarea(label, value, field, maxLength) {
  return h('label', { class: 'editor-lapangan' }, label,
    h('textarea', {
      class: 'input', 'data-field': field, maxlength: maxLength, rows: 3,
    }, value ?? ''));
}

export function buatKktpEditor(atp, kktp = null, onChange = () => {}) {
  const tujuan = ratakanTp(atp);
  const lama = new Map((kktp?.items ?? []).map((item) => [normKode(item.kode), item]));
  const root = h('div', { class: 'editor-dokumen' });
  const rubrikUmum = Array.from({
    length: Math.max(4, Math.min(8, kktp?.rubrikUmum?.length ?? 0)),
  }, (_, index) => kktp?.rubrikUmum?.[index] ?? Object.fromEntries(
    KATEGORI_RUBRIK_UMUM.map(([field]) => [field, PERLU_KONFIRMASI]),
  ));
  const ambang = h('label', { class: 'editor-lapangan' }, t('kktp.ambang'),
    h('input', {
      class: 'input', type: 'number', min: 1, max: 100, step: 1, 'data-field': 'ambang',
      value: kktp?.ambang ?? 75,
    }));

  root.append(
    ambang,
    h('p', { class: 'meta' }, t('kktp.editorPetunjuk')),
    h('fieldset', { class: 'editor-kelompok' },
      h('legend', null, t('kktp.rubrikUmum')),
      rubrikUmum.map((item, index) => h('div', { class: 'kktp-rubrik-umum' },
        h('h3', null, t('kktp.aspekKe', { nomor: index + 1 })),
        KATEGORI_RUBRIK_UMUM.map(([field, label]) =>
          textarea(t(label), item[field] ?? PERLU_KONFIRMASI, `rubrikUmum:${index}:${field}`, 600))))),
  );
  for (const [index, tp] of tujuan.entries()) {
    const existing = lama.get(normKode(tp.kode));
    root.append(h('fieldset', { class: 'editor-kelompok' },
      h('legend', null, `${tp.kode}: ${tp.rumusan}`),
      textarea(t('kktp.indikatorPetunjuk'), (existing?.indikator ?? []).join('\n'), `indikator:${index}`, 3207),
      textarea(t('kktp.bentukAsesmen'), existing?.asesmen ?? PERLU_KONFIRMASI, `asesmen:${index}`, 600),
      LEVEL.map(([level, key]) => textarea(t(key), existing?.rubrik?.[level] ?? '', `rubrik:${index}:${level}`, 600)),
      textarea(t('kktp.tindakLanjut'), existing?.tindakLanjut ?? PERLU_KONFIRMASI, `tindakLanjut:${index}`, 600)));
  }
  root.addEventListener('input', onChange);
  return {
    el: root,
    ambil() {
      const items = tujuan.map((tp, index) => ({
        kode: tp.kode,
        indikator: root.querySelector(`[data-field="indikator:${index}"]`)
          .value.split(/\r?\n/).map((item) => item.trim()).filter(Boolean),
        asesmen: root.querySelector(`[data-field="asesmen:${index}"]`).value.trim(),
        rubrik: Object.fromEntries(LEVEL.map(([level]) => [
          level,
          root.querySelector(`[data-field="rubrik:${index}:${level}"]`).value.trim(),
        ])),
        tindakLanjut: root.querySelector(`[data-field="tindakLanjut:${index}"]`).value.trim(),
      }));
      return {
        ambang: Number(root.querySelector('[data-field="ambang"]').value),
        items,
        rubrikUmum: rubrikUmum.map((_, index) => Object.fromEntries(KATEGORI_RUBRIK_UMUM.map(([field]) => [
          field,
          root.querySelector(`[data-field="rubrikUmum:${index}:${field}"]`).value.trim(),
        ]))),
      };
    },
  };
}
