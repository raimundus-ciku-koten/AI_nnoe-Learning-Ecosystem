import { h, clear, initials } from '../../utils/dom.js';
import { getState, subscribe } from '../../state.js';
import { supabase } from '../../lib/supabase.ts';
import { muatRiwayatPanggilan } from '../../services/callHistory.js';
import { buatTabChat } from './chatTabs.js';
import { jenisChat } from './chatList.js';
import { waktuDaftar } from '../../utils/chatUtil.js';

const LABEL_OUTCOME = {
  completed: 'Selesai',
  missed: 'Tak terjawab',
  rejected: 'Ditolak',
  cancelled: 'Dibatalkan',
  failed: 'Gagal',
  ringing: 'Berdering',
};

function tautanRuang(conversationId, kind) {
  return `#/chat/${encodeURIComponent(conversationId)}?call=${kind}`;
}

export async function tampilkanHubKomunikasi(outlet, mode) {
  if (mode !== 'telepon' && mode !== 'video') {
    throw new TypeError('Bagian komunikasi tidak dikenal.');
  }

  const user = getState().user;
  if (!user?.uid) {
    outlet.append(h('p', { class: 'empty-state', role: 'alert' }, 'Sesi pengguna tidak tersedia.'));
    return () => {};
  }

  let active = true;
  let kata = '';
  let riwayat = [];
  let errorLoad = '';
  const tab = buatTabChat(mode);
  const daftar = h('div', { class: 'chat-communication__list', role: 'list' });
  const pencarian = h('input', {
    class: 'form-control',
    type: 'search',
    placeholder: mode === 'telepon' ? 'Cari riwayat panggilan…' : 'Cari percakapan…',
    'aria-label': mode === 'telepon' ? 'Cari riwayat panggilan' : 'Cari percakapan untuk video call',
    autocomplete: 'off',
    oninput: (event) => {
      kata = event.currentTarget.value.trim().toLocaleLowerCase();
      gambar();
    },
  });
  const konten = h('section', { class: 'chat-communication' },
    h('header', { class: 'chat-communication__head' },
      h('div', {},
        h('h1', { class: 'h4 mb-1' }, mode === 'telepon' ? 'Telepon' : 'Video Call'),
        h('p', { class: 'text-muted mb-0' }, mode === 'telepon'
          ? 'Panggilan masuk, keluar, dan tak terjawab selama 90 hari terakhir.'
          : 'Pilih percakapan untuk memulai panggilan video.')),
      mode === 'telepon' ? h('button', {
        class: 'btn btn-sm btn-outline-secondary',
        type: 'button',
        onclick: () => { void muat(); },
      }, 'Muat ulang') : null),
    h('div', { class: 'chat-communication__search' }, pencarian),
    daftar);
  outlet.append(h('div', { class: 'chat-halaman chat-halaman-komunikasi' }, tab.el, konten));

  function gambar() {
    clear(daftar);
    if (errorLoad) {
      daftar.append(h('p', { class: 'chat-communication__error', role: 'alert' }, errorLoad));
      return;
    }

    if (mode === 'telepon') {
      const tampil = riwayat.filter((call) => {
        const chat = (getState().chats || []).find((item) => item.id === call.conversation_id);
        const title = chat?.name || (call.media_kind === 'video' ? 'Panggilan video' : 'Panggilan suara');
        return `${title} ${LABEL_OUTCOME[call.outcome] || call.outcome}`.toLocaleLowerCase().includes(kata);
      });
      if (tampil.length === 0) {
        daftar.append(h('p', { class: 'empty-state' }, kata
          ? 'Tidak ada riwayat panggilan yang cocok.'
          : 'Belum ada riwayat panggilan dalam 90 hari terakhir.'));
        return;
      }

      for (const call of tampil) {
        const chat = (getState().chats || []).find((item) => item.id === call.conversation_id);
        const title = chat?.name || (call.participant_ids || [])
          .find((id) => id !== user.uid) || 'Percakapan';
        const direction = call.started_by === user.uid ? 'Keluar' : 'Masuk';
        daftar.append(h('article', { class: 'chat-communication__item', role: 'listitem' },
          h('span', { class: 'avatar' },
            h('i', {
              class: `bi ${call.outcome === 'missed' ? 'bi-telephone-x' : 'bi-telephone-inbound'}`,
              'aria-hidden': 'true',
            })),
          h('span', { class: 'chat-communication__details' },
            h('strong', {}, title),
            h('small', {}, `${direction} · ${LABEL_OUTCOME[call.outcome] || 'Panggilan'} · ${waktuDaftar(Date.parse(call.started_at))}`),
            h('small', {}, call.media_kind === 'video' ? 'Video' : 'Suara')),
          h('a', {
            class: 'btn btn-sm btn-outline-secondary',
            href: tautanRuang(call.conversation_id, call.media_kind),
            'aria-label': `Panggil ulang ${title} melalui ${call.media_kind === 'video' ? 'video' : 'suara'}`,
          }, h('i', { class: `bi ${call.media_kind === 'video' ? 'bi-camera-video' : 'bi-telephone'}`, 'aria-hidden': 'true' }))));
      }
      return;
    }

    const chats = (getState().chats || [])
      .filter((chat) => !kata || `${chat.name || ''}`.toLocaleLowerCase().includes(kata))
      .sort((a, b) => (b.lastTs || 0) - (a.lastTs || 0));
    if (chats.length === 0) {
      daftar.append(h('p', { class: 'empty-state' }, kata
        ? 'Tidak ada percakapan yang cocok.'
        : 'Belum ada percakapan untuk memulai video call.'));
      return;
    }
    for (const chat of chats) {
      const group = jenisChat(chat) === 'group';
      daftar.append(h('article', { class: 'chat-communication__item', role: 'listitem' },
        h('span', { class: 'avatar' },
          group
            ? h('i', { class: 'bi bi-people-fill', 'aria-hidden': 'true' })
            : initials(chat.name)),
        h('span', { class: 'chat-communication__details' },
          h('strong', {}, chat.name || (group ? 'Grup' : 'Percakapan')),
          h('small', {}, group ? 'Panggilan grup dibatasi empat peserta.' : 'Panggilan video pribadi')),
        h('a', {
          class: 'btn btn-sm btn-ale',
          href: tautanRuang(chat.id, 'video'),
          'aria-label': `Mulai panggilan video dengan ${chat.name || 'percakapan'}`,
        }, h('i', { class: 'bi bi-camera-video', 'aria-hidden': 'true' }), ' Video')));
    }
  }

  async function muat() {
    errorLoad = '';
    if (mode === 'telepon') {
      daftar.replaceChildren(h('p', { class: 'empty-state', role: 'status' }, 'Memuat riwayat panggilan…'));
      try {
        riwayat = await muatRiwayatPanggilan(supabase, user.uid);
      } catch (error) {
        console.error('[chat] gagal memuat riwayat panggilan:', error);
        errorLoad = error.message || 'Riwayat panggilan tidak dapat dimuat.';
      }
    }
    if (active) gambar();
  }

  const berhentiState = mode === 'video' ? subscribe(gambar) : () => {};
  await muat();
  return () => {
    active = false;
    berhentiState();
    tab.berhenti();
  };
}
