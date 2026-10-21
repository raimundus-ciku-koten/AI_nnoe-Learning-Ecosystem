import { h } from './dom.js';
import { normKode } from '../engine/prota.js';
import { t } from '../i18n/index.js';

const LIST_FIELDS = Object.freeze([
  ['pemahamanBermakna', 'modul.pemahaman', 6, 600],
  ['pertanyaanPemantik', 'modul.pemantik', 6, 600],
  ['dimensiProfil', 'modul.profil', 8, 160],
  ['sarpras', 'modul.sarpras', 10, 200],
  ['refleksiGuru', 'modul.refleksiGuru', 6, 600],
  ['refleksiSiswa', 'modul.refleksiSiswa', 6, 600],
]);
const MEETING_FIELDS = Object.freeze([
  ['pendahuluan', 'modul.pendahuluan', 8, 600],
  ['inti', 'modul.inti', 12, 600],
  ['penutup', 'modul.penutup', 8, 600],
]);
const ASSESSMENT_FIELDS = Object.freeze([
  ['diagnostik', 'modul.diagnostik'],
  ['formatif', 'modul.formatif'],
  ['sumatif', 'modul.sumatif'],
]);

const field = (label, value, key, maxLength, type = 'text') =>
  h('label', { class: 'editor-lapangan' }, label,
    h('input', {
      class: 'input', type, maxlength: maxLength,
      ...(type === 'number' ? { min: 5, max: 600, step: 1 } : {}),
      'data-field': key, value: value ?? '',
    }));

const textarea = (label, value, key, maxLength) =>
  h('label', { class: 'editor-lapangan' }, label,
    h('textarea', { class: 'input', rows: 3, maxlength: maxLength, 'data-field': key }, value ?? ''));

const listField = (label, value, key, maxItems, maxLength) =>
  textarea(`${label} — ${t('modul.listHint', { max: maxItems })}`, (value ?? []).join('\n'), key, maxItems * (maxLength + 1));

export function buatModulEditor(unit, modul = null, onChange = () => {}) {
  const tujuan = unit.tp ?? [];
  const root = h('div', { class: 'editor-dokumen' });
  let pertemuan = (modul?.pertemuan ?? [{
    ke: 1, judul: '', tujuan: '', menit: 80, pendahuluan: [], inti: [], penutup: [],
  }]).map((item) => ({ ...item }));

  root.append(
    field(t('modul.model'), modul?.model ?? '', 'model', 160),
    h('fieldset', { class: 'editor-kelompok' },
      h('legend', null, t('modul.tujuanKode')),
      tujuan.map((tp) => h('label', { class: 'editor-pilihan' },
        h('input', {
          type: 'checkbox', 'data-tujuan': tp.kode,
          checked: modul ? modul.tujuanKode?.some((kode) => normKode(kode) === normKode(tp.kode)) : true,
        }),
        `${tp.kode}: ${tp.rumusan}`))),
    LIST_FIELDS.map(([key, label, maxItems, maxLength]) =>
      listField(t(label), modul?.[key], key, maxItems, maxLength)),
    h('fieldset', { class: 'editor-kelompok' },
      h('legend', null, t('modul.asesmen')),
      ASSESSMENT_FIELDS.map(([key, label]) => textarea(t(label), modul?.asesmen?.[key], `asesmen:${key}`, 800))),
    textarea(t('modul.remedial'), modul?.remedial, 'remedial', 800),
    textarea(t('modul.pengayaan'), modul?.pengayaan, 'pengayaan', 800),
  );

  const meetingRoot = h('section', { class: 'editor-kelompok' });
  root.append(meetingRoot);

  function renderMeetings() {
    meetingRoot.replaceChildren(
      h('h3', null, t('modul.pertemuan')),
      h('p', { class: 'meta' }, t('modul.pertemuanHint')),
      pertemuan.map((item, index) => h('fieldset', { class: 'editor-kelompok' },
        h('legend', null, t('modul.pertemuanKe', { ke: index + 1 })),
        field(t('modul.judulPertemuan'), item.judul, `meeting:${index}:judul`, 160),
        textarea(t('modul.tujuanPertemuan'), item.tujuan, `meeting:${index}:tujuan`, 600),
        field(t('modul.durasiPertemuan'), item.menit, `meeting:${index}:menit`, 3, 'number'),
        MEETING_FIELDS.map(([key, label, maxItems, maxLength]) =>
          listField(t(label), item[key], `meeting:${index}:${key}`, maxItems, maxLength)),
        pertemuan.length > 1 ? h('button', {
          type: 'button', class: 'tombol tombol-sekunder tombol-kecil', onClick: () => {
            pertemuan.splice(index, 1);
            renderMeetings();
            onChange();
          },
        }, t('modul.hapusPertemuan')) : null)));
    if (pertemuan.length < 12) {
      meetingRoot.append(h('button', {
        type: 'button', class: 'tombol tombol-sekunder', onClick: () => {
          pertemuan.push({
            ke: pertemuan.length + 1, judul: '', tujuan: '', menit: 80,
            pendahuluan: [], inti: [], penutup: [],
          });
          renderMeetings();
          onChange();
        },
      }, t('modul.tambahPertemuan')));
    }
  }
  renderMeetings();
  root.addEventListener('input', onChange);
  root.addEventListener('change', onChange);

  return {
    el: root,
    ambil() {
      const readList = (key) => root.querySelector(`[data-field="${key}"]`).value
        .split(/\r?\n/).map((item) => item.trim()).filter(Boolean);
      return {
        tujuanKode: [...root.querySelectorAll('[data-tujuan]:checked')].map((input) => input.dataset.tujuan),
        model: root.querySelector('[data-field="model"]').value.trim(),
        ...Object.fromEntries(LIST_FIELDS.map(([key]) => [key, readList(key)])),
        pertemuan: pertemuan.map((item, index) => ({
          ke: index + 1,
          judul: root.querySelector(`[data-field="meeting:${index}:judul"]`).value.trim(),
          tujuan: root.querySelector(`[data-field="meeting:${index}:tujuan"]`).value.trim(),
          menit: Number(root.querySelector(`[data-field="meeting:${index}:menit"]`).value),
          ...Object.fromEntries(MEETING_FIELDS.map(([key]) => [key, readList(`meeting:${index}:${key}`)])),
        })),
        asesmen: Object.fromEntries(ASSESSMENT_FIELDS.map(([key]) => [
          key, root.querySelector(`[data-field="asesmen:${key}"]`).value.trim(),
        ])),
        remedial: root.querySelector('[data-field="remedial"]').value.trim(),
        pengayaan: root.querySelector('[data-field="pengayaan"]').value.trim(),
      };
    },
  };
}
