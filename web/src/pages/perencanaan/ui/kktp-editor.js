import { h } from './dom.js';
import { normKode, ratakanTp } from '../engine/prota.js';
import { t } from '../i18n/index.js';

const LEVEL = Object.freeze([
  ['perluBimbingan', 'kktp.levelPerluBimbingan'],
  ['cukup', 'kktp.levelCukup'],
  ['baik', 'kktp.levelBaik'],
  ['sangatBaik', 'kktp.levelSangatBaik'],
]);

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
  const ambang = h('label', { class: 'editor-lapangan' }, t('kktp.ambang'),
    h('input', {
      class: 'input', type: 'number', min: 1, max: 100, step: 1, 'data-field': 'ambang',
      value: kktp?.ambang ?? 75,
    }));

  root.append(ambang, h('p', { class: 'meta' }, t('kktp.editorPetunjuk')));
  for (const [index, tp] of tujuan.entries()) {
    const existing = lama.get(normKode(tp.kode));
    root.append(h('fieldset', { class: 'editor-kelompok' },
      h('legend', null, `${tp.kode}: ${tp.rumusan}`),
      textarea(t('kktp.indikatorPetunjuk'), (existing?.indikator ?? []).join('\n'), `indikator:${index}`, 3207),
      LEVEL.map(([level, key]) => textarea(t(key), existing?.rubrik?.[level] ?? '', `rubrik:${index}:${level}`, 600))));
  }
  root.addEventListener('input', onChange);
  return {
    el: root,
    ambil() {
      const items = tujuan.map((tp, index) => ({
        kode: tp.kode,
        indikator: root.querySelector(`[data-field="indikator:${index}"]`)
          .value.split(/\r?\n/).map((item) => item.trim()).filter(Boolean),
        rubrik: Object.fromEntries(LEVEL.map(([level]) => [
          level,
          root.querySelector(`[data-field="rubrik:${index}:${level}"]`).value.trim(),
        ])),
      }));
      return {
        ambang: Number(root.querySelector('[data-field="ambang"]').value),
        items,
      };
    },
  };
}
