// web/src/views/chat/chatRoom.js
/**
 * chatRoom.js — Ruang percakapan (kolom kanan).
 * Mendengarkan pesan realtime + presence + tanda baca.
 * Mengembalikan cleanup → WAJIB dipanggil saat keluar halaman (router melakukannya).
 */
import { h, initials } from '../../utils/dom.js';
import { getState, subscribe } from '../../state.js';
import { toast } from '../../utils/toast.js';
import {
  hubungkanGoogleDriveUntukPengguna,
  hubungkanGoogleWorkspaceUntukPengguna,
  tokenGoogleWorkspacePerPengguna,
} from '../../services/googleWorkspaceAuth.js';
import { unggahKeDrive } from '../../services/googleWorkspace.js';
import { identitasEnkripsiDriveDalamSesi } from '../../services/driveEncryption.js';
import {
  ambilMeta, pantauPesan, muatPesanLama, kirimPesan, tandaiDibaca,
  pantauBacaan, unggahBerkas, ambilLampiran
} from '../../services/chat.js';
import { pantauPresence } from '../../services/presence.js';
import { ambilIceServers, buatPengendaliPanggilan } from '../../services/chatCalls.js';
import { CHAT_CALLS_ENABLED } from '../../services/featureFlags.js';
import { supabase } from '../../lib/supabase.ts';
import {
  MAKS_TEKS, ATRIBUT_ACCEPT, idValid, formatUkuran, jamMenit,
  labelHari, kunciHari, statusTerakhirDilihat, presenceMasihAktif, pesanGalatChat, periksaBerkas,
  namaLampiranTampil
} from '../../utils/chatUtil.js';

// Kode Unicode agar aman di semua editor/berkas.
const EMOJI = [
  '\u{1F600}', '\u{1F60A}', '\u{1F602}', '\u{1F44D}', '\u{1F64F}', '\u{1F44F}',
  '\u{1F389}', '\u2764\uFE0F', '\u{1F622}', '\u{1F62E}', '\u{1F914}', '\u2705',
  '\u{1F4DA}', '\u{1F4DD}', '\u23F0', '\u{1F64C}'
];
const JUMLAH_AWAL = 50;
const JUMLAH_LAMA = 30;

export async function tampilkanRuang(panel, chatId) {
  const { user } = getState();
  if (!user) return () => {};
  const saya = user.uid;

  if (!idValid(chatId)) {
    panel.append(h('p', { class: 'empty-state m-auto' }, 'Alamat percakapan tidak valid.'));
    return () => {};
  }

  // 1. Meta percakapan (ditolak Rules = bukan anggota)
  let meta = null;
  try { meta = await ambilMeta(chatId); } catch { /* bukan anggota */ }

  if (!meta || !meta.members || !meta.members[saya]) {
    panel.append(
      h('div', { class: 'empty-state m-auto' },
        h('p', {}, 'Percakapan tidak ditemukan atau Anda bukan anggotanya.'),
        h('a', { href: '#/chat', class: 'btn btn-sm btn-light' }, 'Kembali ke daftar'))
    );
    return () => {};
  }

  const anggota = Object.keys(meta.members);
  const grup = meta.type === 'group';
  const nama = (uid) => meta.names?.[uid] || 'Pengguna';
  const lawan = grup ? null : anggota.find((u) => u !== saya);
  const judul = grup ? (meta.name || 'Grup') : nama(lawan);

  let aktif = true;
  const pembatal = [];
  let semua = [];                 // pesan terurut kronologis
  let bacaan = {};                // uid → waktu terakhir membaca
  const ada = new Set();          // id pesan yang sudah digambar (cegah duplikat)
  const tanda = new Map();        // id pesan → { el, ts } (centang)
  let hariTerakhir = '';
  let pesanTertua = null;
  let masihAdaLama = false;
  let jadwalBaca = null;
  let mengunggah = false;

  /* ---------- Kepala ---------- */
  const status = h('small', { class: 'text-muted', 'aria-live': 'polite' },
    grup ? `${anggota.length} anggota` : '');

  const kepala = h('div', { class: 'chat-kepala' },
    h('a', {
      href: grup ? '#/chat/grup' : '#/chat',
      class: 'btn btn-sm btn-light d-lg-none', 'aria-label': 'Kembali ke daftar'
    }, h('i', { class: 'bi bi-arrow-left', 'aria-hidden': 'true' })),
    h('span', { class: 'avatar' },
      grup ? h('i', { class: 'bi bi-people-fill', 'aria-hidden': 'true' }) : initials(judul)),
    h('div', { class: 'chat-kepala__teks' }, h('strong', {}, judul), status));

  let pengendaliPanggilan = null;
  const statusPanggilan = h('p', { class: 'chat-call__status', role: 'status', 'aria-live': 'polite', hidden: true });
  const terimaPanggilan = h('button', {
    class: 'btn btn-sm btn-success', type: 'button', hidden: true,
    onclick: async () => {
      try {
        await pengendaliPanggilan.terima(await ambilIceServers(supabase, chatId));
      } catch (error) {
        console.error('[chat] menerima panggilan gagal:', error);
        toast(error.message || 'Panggilan tidak dapat diterima.', 'error');
      }
    }
  }, 'Terima');
  const akhiriPanggilan = h('button', {
    class: 'btn btn-sm btn-outline-danger', type: 'button', hidden: true,
    onclick: () => { void pengendaliPanggilan?.akhiri().catch((error) => toast(error.message, 'error')); }
  }, 'Akhiri');
  const videoLokal = h('video', {
    class: 'chat-call__video chat-call__video--local', autoplay: true, playsinline: true, muted: true, hidden: true,
    'aria-label': 'Pratinjau video Anda',
  });
  const videoJarakJauh = h('video', {
    class: 'chat-call__video', autoplay: true, playsinline: true, hidden: true,
    'aria-label': 'Video lawan bicara',
  });
  const audioJarakJauh = h('audio', { autoplay: true, hidden: true });
  const panelPanggilan = h('section', { class: 'chat-call', 'aria-label': 'Panggilan suara dan video', hidden: true },
    h('div', { class: 'chat-call__media' }, videoJarakJauh, videoLokal, audioJarakJauh),
    statusPanggilan,
    h('div', { class: 'chat-call__actions' }, terimaPanggilan, akhiriPanggilan));
  const tombolPanggilan = [];
  let kontakAktifUntukPanggilan = false;
  let panggilanTerhubung = false;
  function terapkanPanggilan(state) {
    const active = state.status !== 'idle';
    panelPanggilan.hidden = !active;
    statusPanggilan.hidden = !active;
    terimaPanggilan.hidden = state.status !== 'incoming';
    akhiriPanggilan.hidden = !active;
    statusPanggilan.textContent = state.status === 'incoming'
      ? `Panggilan ${state.kind === 'video' ? 'video' : 'suara'} masuk.`
      : state.status === 'ringing'
        ? 'Memanggil…'
        : state.status === 'connected'
          ? 'Panggilan tersambung.'
          : state.status === 'error'
            ? state.error?.message || 'Koneksi panggilan bermasalah.'
            : 'Menghubungkan panggilan…';
    akhiriPanggilan.textContent = state.status === 'incoming' ? 'Tolak panggilan' : 'Akhiri panggilan';
    videoLokal.hidden = state.kind !== 'video' || !state.localStream;
    videoJarakJauh.hidden = state.kind !== 'video' || !state.remoteStream;
    audioJarakJauh.hidden = state.kind !== 'audio' || !state.remoteStream;
    if (state.localStream && videoLokal.srcObject !== state.localStream) videoLokal.srcObject = state.localStream;
    if (state.remoteStream) {
      const media = state.kind === 'video' ? videoJarakJauh : audioJarakJauh;
      if (media.srcObject !== state.remoteStream) media.srcObject = state.remoteStream;
      void media.play().catch(() => {});
    } else if (!active) {
      videoLokal.srcObject = null;
      videoJarakJauh.srcObject = null;
      audioJarakJauh.srcObject = null;
    }
    terimaPanggilan.disabled = !kontakAktifUntukPanggilan;
    tombolPanggilan.forEach((button) => {
      button.disabled = active || !kontakAktifUntukPanggilan;
    });
  }

  if (CHAT_CALLS_ENABLED && !grup && lawan && globalThis.navigator?.mediaDevices?.getUserMedia &&
      typeof globalThis.RTCPeerConnection === 'function') {
    pengendaliPanggilan = buatPengendaliPanggilan({
      supabase,
      conversationId: chatId,
      userId: saya,
      peerIds: [lawan],
      onChange: terapkanPanggilan,
    });
    for (const [kind, label, icon] of [
      ['audio', 'Panggilan suara', 'bi-telephone'],
      ['video', 'Panggilan video', 'bi-camera-video'],
    ]) {
      const button = h('button', {
        class: 'btn btn-sm btn-light', type: 'button', 'aria-label': label,
        title: label,
        onclick: async () => {
          button.disabled = true;
          try {
            await pengendaliPanggilan.mulai(kind, lawan, await ambilIceServers(supabase, chatId));
          } catch (error) {
            console.error('[chat] memulai panggilan gagal:', error);
            toast(error.message || 'Panggilan tidak dapat dimulai.', 'error');
          } finally {
            button.disabled = pengendaliPanggilan.state.status !== 'idle';
          }
        }
      }, h('i', { class: `bi ${icon}`, 'aria-hidden': 'true' }));
      tombolPanggilan.push(button);
      kepala.append(button);
    }
  }

  if (lawan) {
    pembatal.push(pantauPresence(lawan, (p) => {
      const statusPresence = p ? { ...p, online: presenceMasihAktif(p) } : null;
      status.textContent = statusTerakhirDilihat(statusPresence);
      status.classList.toggle('text-success', Boolean(statusPresence?.online));
    }));
  }

  /* ---------- Daftar pesan ---------- */
  const daftar = h('div', { class: 'chat-pesan', role: 'log', 'aria-live': 'polite', 'aria-label': 'Pesan' });
  const urlLampiran = new Set();
  const unduhan = new Map();
  const pengendaliUnduhan = new Set();

  async function kredensialLampiran() {
    const identity = identitasEnkripsiDriveDalamSesi(saya);
    if (!identity) {
      throw new Error('Siapkan identitas enkripsi di halaman Google Workspace sebelum membuka lampiran chat.');
    }
    let accessToken = tokenGoogleWorkspacePerPengguna(saya);
    if (!accessToken) {
      ({ accessToken } = await hubungkanGoogleDriveUntukPengguna(user));
    }
    return { accessToken, identity: { ...identity, userId: saya } };
  }

  function muatLampiran(pesan) {
    if (unduhan.has(pesan.id)) return unduhan.get(pesan.id);
    const controller = new AbortController();
    pengendaliUnduhan.add(controller);
    const pending = kredensialLampiran()
      .then(({ accessToken, identity }) => ambilLampiran(
        pesan.id,
        chatId,
        saya,
        accessToken,
        identity,
        controller.signal,
      ))
      .then((lampiran) => {
        if (!aktif) {
          URL.revokeObjectURL(lampiran.url);
          throw new DOMException('Ruang percakapan telah ditutup.', 'AbortError');
        }
        pesan.fileName = lampiran.fileName;
        urlLampiran.add(lampiran.url);
        return lampiran;
      })
      .catch((error) => {
        unduhan.delete(pesan.id);
        throw error;
      })
      .finally(() => pengendaliUnduhan.delete(controller));
    unduhan.set(pesan.id, pending);
    return pending;
  }

  async function bukaLampiran(event, pesan, tautan) {
    if (tautan.dataset.siap === 'true') return;
    event.preventDefault();
    const tab = window.open('about:blank', '_blank');
    if (tab) tab.opener = null;
    try {
      const lampiran = await muatLampiran(pesan);
      tautan.href = lampiran.url;
      tautan.dataset.siap = 'true';
      const gambar = tautan.querySelector('img');
      if (gambar) {
        gambar.src = lampiran.url;
        gambar.alt = lampiran.fileName;
      }
      const label = tautan.querySelector('.chat-berkas__nama');
      if (label) label.textContent = lampiran.fileName;
      if (tab) tab.location.replace(lampiran.url);
      else toast('Lampiran siap dibuka. Pilih tautan sekali lagi.', 'info');
    } catch (error) {
      if (tab) tab.close();
      if (aktif && error?.name !== 'AbortError') {
        console.error('[chat] lampiran gagal dimuat:', error);
        toast(pesanGalatChat(error), 'error');
      }
    }
  }

  async function simpanSalinanDrive(pesan, tombol) {
    if (tombol.disabled) return;
    tombol.disabled = true;
    tombol.textContent = 'Menyiapkan salinan…';
    try {
      const sesi = await hubungkanGoogleWorkspaceUntukPengguna(user);
      const lampiran = await muatLampiran(pesan);
      const response = await fetch(lampiran.url);
      if (!response.ok) throw new Error(`Lampiran gagal dibaca (${response.status}).`);
      const blob = await response.blob();
      const namaDrive = namaLampiranTampil(lampiran.fileName).nama;
      const file = new File([blob], namaDrive, { type: lampiran.mimeType || 'application/octet-stream' });
      const hasil = await unggahKeDrive(sesi.accessToken, file);
      if (!hasil.id) throw new Error('Google Drive tidak mengembalikan ID berkas.');
      const link = h('a', {
        class: 'chat-drive-save',
        href: hasil.webViewLink || `https://drive.google.com/open?id=${encodeURIComponent(hasil.id)}`,
        target: '_blank',
        rel: 'noopener noreferrer',
      }, 'Buka salinan di Drive');
      tombol.replaceWith(link);
    } catch (error) {
      console.error('[chat] salinan lampiran ke Drive gagal:', error);
      tombol.disabled = false;
      tombol.textContent = 'Coba simpan ke Drive lagi';
      toast(error?.message || 'Salinan tidak dapat disimpan ke Drive. Coba hubungkan ulang akun Google.', 'error');
    }
  }

  const tombolLama = h('button', {
    class: 'btn btn-sm btn-light d-block mx-auto my-2 d-none', type: 'button',
    onclick: async () => {
      if (!pesanTertua) return;
      tombolLama.disabled = true;
      try {
        const lama = await muatPesanLama(chatId, pesanTertua, JUMLAH_LAMA);
        if (lama.length === 0) { masihAdaLama = false; tombolLama.classList.add('d-none'); return; }
        const tinggiLama = daftar.scrollHeight;
        semua = [...lama, ...semua];
        pesanTertua = semua[0].id;
        masihAdaLama = lama.length >= JUMLAH_LAMA;
        gambarSemua();
        daftar.scrollTop = daftar.scrollHeight - tinggiLama; // pertahankan posisi baca
        tombolLama.classList.toggle('d-none', !masihAdaLama);
      } catch (e) {
        toast(pesanGalatChat(e), 'error');
      } finally { tombolLama.disabled = false; }
    }
  }, 'Muat pesan sebelumnya');

  function centang(p) {
    if (grup || p.senderId !== saya) return null;
    const dibaca = (bacaan[lawan] ?? 0) >= (p.ts ?? 0);
    return h('span', {
      class: `centang${dibaca ? ' dibaca' : ''}`,
      title: dibaca ? 'Dibaca' : 'Terkirim'
    }, dibaca ? '✓✓' : '✓');
  }

  function elemenPesan(p) {
    const milikSaya = p.senderId === saya;
    let isi;
    if (p.type === 'image' && p.fileId) {
      const image = h('img', {
        alt: 'Foto terenkripsi',
        class: 'chat-img',
      });
      const link = h('a', {
        href: '#',
        target: '_blank',
        rel: 'noopener noreferrer',
        onclick: (event) => bukaLampiran(event, p, event.currentTarget),
      }, image);
      isi = link;
    } else if (p.type === 'file' && p.fileId) {
      isi = h('a', {
        href: '#',
        target: '_blank',
        rel: 'noopener noreferrer',
        class: 'chat-berkas',
        onclick: (event) => bukaLampiran(event, p, event.currentTarget),
      },
      h('i', { class: 'bi bi-paperclip', 'aria-hidden': 'true' }), ' ',
      h('span', { class: 'chat-berkas__nama' }, 'Berkas terenkripsi'),
      p.fileSize ? h('small', { class: 'chat-berkas__ukuran' }, ` (${formatUkuran(p.fileSize)})`) : null);
    } else if (p.type === 'text') {
      // textContent (lewat h), BUKAN innerHTML — mencegah XSS.
      isi = h('span', { class: 'chat-teks' }, p.text);
    } else {
      isi = h('em', {}, 'Lampiran tidak dapat ditampilkan.');
    }

    const tc = centang(p);
    if (tc) tanda.set(p.id, { el: tc, ts: p.ts });

    return h('div', { class: `gelembung ${milikSaya ? 'saya' : 'lain'}` },
      !milikSaya && grup ? h('small', { class: 'pengirim' }, nama(p.senderId)) : null,
      isi,
      p.fileId ? h('button', {
        class: 'chat-drive-save',
        type: 'button',
        onclick: (event) => simpanSalinanDrive(p, event.currentTarget),
      }, 'Simpan salinan di Drive saya') : null,
      h('span', { class: 'waktu' }, jamMenit(p.ts), tc ? ' ' : '', tc));
  }

  function pisahHari(p) {
    const hari = p.ts ? kunciHari(p.ts) : hariTerakhir;
    if (hari === hariTerakhir) return null;
    hariTerakhir = hari;
    return h('div', { class: 'pisah-hari' }, h('span', {}, p.ts ? labelHari(p.ts) : ''));
  }

  function gambarSemua() {
    daftar.replaceChildren(tombolLama);
    tanda.clear();
    ada.clear();
    hariTerakhir = '';
    for (const p of semua) {
      const pisah = pisahHari(p);
      if (pisah) daftar.append(pisah);
      daftar.append(elemenPesan(p));
      ada.add(p.id);
    }
  }

  function tambahSatu(p) {
    if (!aktif || ada.has(p.id)) return;
    const dekat = daftar.scrollHeight - daftar.scrollTop - daftar.clientHeight < 140;
    ada.add(p.id);
    semua.push(p);
    if (!pesanTertua) pesanTertua = p.id;
    if (semua.length >= JUMLAH_AWAL && !masihAdaLama) {
      masihAdaLama = true;
      tombolLama.classList.remove('d-none');
    }
    const pisah = pisahHari(p);
    if (pisah) daftar.append(pisah);
    daftar.append(elemenPesan(p));
    if (dekat || p.senderId === saya) daftar.scrollTop = daftar.scrollHeight;
    if (p.senderId !== saya) bacaSebentarLagi();
  }

  /* ---------- Tanda dibaca (debounced) ---------- */
  function bacaSebentarLagi() {
    clearTimeout(jadwalBaca);
    jadwalBaca = setTimeout(() => {
      if (aktif && document.visibilityState === 'visible') tandaiDibaca(chatId, saya).catch(() => {});
    }, 400);
  }
  const saatTampil = () => { if (document.visibilityState === 'visible') bacaSebentarLagi(); };
  document.addEventListener('visibilitychange', saatTampil);
  pembatal.push(() => document.removeEventListener('visibilitychange', saatTampil));

  /* ---------- Penulis pesan ---------- */
  const kolom = h('textarea', {
    class: 'form-control', rows: 1, maxlength: MAKS_TEKS,
    placeholder: 'Tulis pesan…', 'aria-label': 'Tulis pesan',
    oninput: () => { kolom.style.height = 'auto'; kolom.style.height = `${Math.min(kolom.scrollHeight, 120)}px`; },
    onkeydown: (e) => {
      if (e.key === 'Enter' && !e.shiftKey && !e.isComposing) { e.preventDefault(); kirimTeks(); }
    }
  });

  async function kirimTeks() {
    if (kolom.disabled) return;
    const teks = kolom.value.trim();
    if (!teks) return;
    kolom.value = '';
    kolom.style.height = 'auto';
    try {
      await kirimPesan(chatId, saya, anggota, { type: 'text', text: teks }, meta);
    } catch (error) {
      console.error('[chat] kirim gagal:', error);
      kolom.value = teks;
      toast(pesanGalatChat(error, 'kirim'), 'error');
    }
  }

  const inputBerkas = h('input', {
    type: 'file', class: 'd-none', accept: ATRIBUT_ACCEPT,
    onchange: async () => {
      const berkas = inputBerkas.files[0];
      inputBerkas.value = '';
      if (!berkas || mengunggah) return;
      const cek = periksaBerkas(berkas);
      if (!cek.ok) { toast(cek.alasan, 'error'); return; }
      mengunggah = true;
      tombolLampir.disabled = true;
      toast('Mengunggah…');
      try {
        const { accessToken, identity } = await kredensialLampiran();
        await unggahBerkas(chatId, saya, berkas, accessToken, identity);
      } catch (error) {
        console.error('[chat] unggah gagal:', error);
        toast(pesanGalatChat(error, 'kirim'), 'error');
      } finally {
        mengunggah = false;
        tombolLampir.disabled = kolom.disabled;
      }
    }
  });

  const kotakEmoji = h('div', { class: 'emoji-kotak d-none', role: 'group', 'aria-label': 'Pilih emoji' },
    EMOJI.map((e) => h('button', {
      type: 'button', class: 'emoji', 'aria-label': `Sisipkan ${e}`,
      onclick: () => { kolom.value += e; kolom.focus(); }
    }, e)));

  const tombolEmoji = h('button', {
    class: 'btn btn-light', type: 'button', 'aria-label': 'Emoji',
    onclick: (e) => { e.stopPropagation(); kotakEmoji.classList.toggle('d-none'); }
  }, h('i', { class: 'bi bi-emoji-smile', 'aria-hidden': 'true' }));

  const tombolLampir = h('button', {
    class: 'btn btn-light', type: 'button', 'aria-label': 'Lampirkan berkas',
    onclick: () => inputBerkas.click()
  }, h('i', { class: 'bi bi-paperclip', 'aria-hidden': 'true' }));

  const tombolKirim = h('button', {
    class: 'btn btn-ale', type: 'button', 'aria-label': 'Kirim', onclick: kirimTeks
  }, h('i', { class: 'bi bi-send-fill', 'aria-hidden': 'true' }));

  // Tutup kotak emoji saat klik di luar.
  const tutupEmoji = (e) => {
    if (!kotakEmoji.classList.contains('d-none') && !kotakEmoji.contains(e.target)) kotakEmoji.classList.add('d-none');
  };
  document.addEventListener('click', tutupEmoji);
  pembatal.push(() => document.removeEventListener('click', tutupEmoji));

  const catatan = h('div', { class: 'chat-catatan', role: 'status', hidden: true },
    'Anda tidak lagi terhubung sebagai kontak, jadi pesan baru tidak dapat dikirim. ',
    h('a', { href: '#/chat/kontak' }, 'Buka Kontak'));

  const penulis = h('div', { class: 'chat-penulis' },
    kotakEmoji, tombolEmoji, tombolLampir, inputBerkas, kolom, tombolKirim);

  /* Chat pribadi hanya boleh dikirimi bila kontak masih 'accepted' (selaras Rules). */
  function terapkanStatusKontak(s) {
    if (grup) return;
    const aktifKontak = s.kontakSiap &&
      (s.kontak || []).some((k) => k.peerUid === lawan && k.status === 'accepted');
    kontakAktifUntukPanggilan = aktifKontak;
    catatan.hidden = aktifKontak;
    for (const el of [kolom, tombolKirim, tombolEmoji, tombolLampir]) el.disabled = !aktifKontak || (el === tombolLampir && mengunggah);
    terimaPanggilan.disabled = !aktifKontak;
    tombolPanggilan.forEach((button) => {
      button.disabled = !aktifKontak || pengendaliPanggilan?.state.status !== 'idle';
    });
    if (!aktifKontak && pengendaliPanggilan?.state.status !== 'idle') {
      void pengendaliPanggilan.akhiri().catch((error) => {
        console.error('[chat] panggilan berhenti setelah kontak dihapus:', error);
      });
    }
    if (aktifKontak && pengendaliPanggilan && !panggilanTerhubung) {
      panggilanTerhubung = true;
      void pengendaliPanggilan.hubungkan().catch((error) => {
        panggilanTerhubung = false;
        console.error('[chat] kanal panggilan gagal dihubungkan:', error);
        toast(error.message || 'Panggilan belum dapat dihubungkan.', 'error');
      });
    }
  }
  terapkanStatusKontak(getState());
  pembatal.push(subscribe(terapkanStatusKontak));

  panel.append(kepala, panelPanggilan, daftar, catatan, penulis);

  /* ---------- Mulai mendengarkan ---------- */
  pembatal.push(pantauBacaan(chatId, (nilai) => {
    bacaan = nilai;
    tanda.forEach(({ el, ts }) => {
      const dibaca = (bacaan[lawan] ?? 0) >= (ts ?? 0);
      el.textContent = dibaca ? '✓✓' : '✓';
      el.classList.toggle('dibaca', dibaca);
      el.title = dibaca ? 'Dibaca' : 'Terkirim';
    });
  }));
  pembatal.push(pantauPesan(chatId, tambahSatu, JUMLAH_AWAL));
  bacaSebentarLagi();

  return () => {
    aktif = false;
    clearTimeout(jadwalBaca);
    pengendaliUnduhan.forEach((controller) => controller.abort());
    urlLampiran.forEach((url) => URL.revokeObjectURL(url));
    pembatal.forEach((fn) => { try { fn(); } catch { /* abaikan */ } });
    void pengendaliPanggilan?.dispose().catch((error) => {
      console.error('[chat] pembersihan panggilan gagal:', error);
    });
  };
}
