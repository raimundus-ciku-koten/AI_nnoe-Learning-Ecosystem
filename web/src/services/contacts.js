import { supabase } from '../lib/supabase.ts';
import { getState, setState } from '../state.js';
import { ringkas } from '../utils/chatUtil.js';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const TTL_MS = 5 * 60 * 1000;
let tembolok = null;

export class GalatKontak extends Error {
  constructor(pesan, kode = 'kontak/galat') {
    super(pesan);
    this.name = 'GalatKontak';
    this.code = kode;
  }
}

function validasiPihak(saya, orang) {
  if (!UUID.test(saya?.uid || '') || !UUID.test(orang?.uid || '') || saya.uid === orang.uid) {
    throw new GalatKontak('Pengguna tidak valid.');
  }
}

function namaKontak(row, uid) {
  const peerUid = row.from_user_id === uid ? row.to_user_id : row.from_user_id;
  const arah = row.from_user_id === uid ? 'keluar' : 'masuk';
  return {
    id: row.id,
    peerUid,
    name: ringkas(row.participant_names?.[peerUid] || 'Pengguna', 80),
    status: row.status,
    arah,
    ts: new Date(row.updated_at || row.created_at).getTime(),
  };
}

export async function muatKontak(uid = getState().user?.uid) {
  if (!UUID.test(uid || '')) return [];
  const { data, error } = await supabase
    .from('chat_contacts')
    .select('id,from_user_id,to_user_id,status,participant_names,created_at,updated_at')
    .or(`from_user_id.eq.${uid},to_user_id.eq.${uid}`)
    .order('created_at', { ascending: false });
  if (error) throw error;
  const contacts = (data || []).map((row) => namaKontak(row, uid));
  setState({
    kontak: contacts,
    permintaanMasuk: contacts.filter((contact) =>
      contact.status === 'pending' && contact.arah === 'masuk').length,
    kontakSiap: true,
  });
  return contacts;
}

/* ------------------------------------------------------------------ */
/* Mutasi                                                              */
/* ------------------------------------------------------------------ */

export async function kirimPermintaan(saya, orang) {
  validasiPihak(saya, orang);
  const { data: existing, error: lookupError } = await supabase
    .from('chat_contacts')
    .select('id,from_user_id,to_user_id,status')
    .or(`and(from_user_id.eq.${saya.uid},to_user_id.eq.${orang.uid}),and(from_user_id.eq.${orang.uid},to_user_id.eq.${saya.uid})`)
    .maybeSingle();
  if (lookupError) throw lookupError;

  if (existing?.status === 'accepted') throw new GalatKontak('Sudah menjadi kontak.');
  if (existing?.status === 'pending') {
    if (existing.from_user_id === saya.uid) {
      throw new GalatKontak('Permintaan sudah dikirim, menunggu persetujuan.');
    }
    return terimaPermintaan(saya, existing.id);
  }

  const { data, error } = await supabase
    .from('chat_contacts')
    .insert({
      from_user_id: saya.uid,
      to_user_id: orang.uid,
      status: 'pending',
      participant_names: {
        [saya.uid]: ringkas(saya.nama || 'Pengguna', 80),
        [orang.uid]: ringkas(orang.nama || 'Pengguna', 80),
      },
    })
    .select('id')
    .single();
  if (error) throw error;
  return data.id;
}

export async function terimaPermintaan(saya, id) {
  if (!UUID.test(saya?.uid || '') || !UUID.test(id || '')) {
    throw new GalatKontak('Permintaan tidak valid.');
  }
  const { data, error } = await supabase
    .from('chat_contacts')
    .update({ status: 'accepted' })
    .eq('id', id)
    .eq('to_user_id', saya.uid)
    .eq('status', 'pending')
    .select('id')
    .maybeSingle();
  if (error) throw error;
  if (!data) throw new GalatKontak('Permintaan tidak ditemukan.');
  return data.id;
}

export async function hapusKontak(saya, id) {
  if (!UUID.test(saya?.uid || '') || !UUID.test(id || '')) {
    throw new GalatKontak('Kontak tidak valid.');
  }
  const { error } = await supabase
    .from('chat_contacts')
    .delete()
    .eq('id', id);
  if (error) throw error;
}

/* ------------------------------------------------------------------ */
/* Pantau                                                              */
/* ------------------------------------------------------------------ */

export function pantauKontak(uid, callback) {
  let aktif = true;
  const refresh = async () => {
    try {
      const contacts = await muatKontak(uid);
      if (aktif) callback(contacts);
    } catch (error) {
      console.error('[contacts] pantauKontak gagal:', error);
    }
  };
  const channel = supabase
    .channel(`chat-contacts:${uid}`)
    .on('postgres_changes', {
      event: '*',
      schema: 'public',
      table: 'chat_contacts',
    }, refresh)
    .subscribe((status, error) => {
      if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') {
        console.error('[contacts] langganan kontak gagal:', error || status);
      }
    });
  void refresh();
  return () => {
    aktif = false;
    void supabase.removeChannel(channel);
  };
}

/* ------------------------------------------------------------------ */
/* Direktori pengguna                                                  */
/* ------------------------------------------------------------------ */

export async function muatDirektori({ paksa = false } = {}) {
  const { user, role, tenantId } = getState();
  if (!user?.uid || !role) {
    throw new GalatKontak('Akun belum siap sehingga direktori tidak dapat dimuat.', 'kontak/session-required');
  }
  const key = `${user.uid}|${tenantId || ''}|${role}`;
  if (!paksa && tembolok?.key === key && Date.now() - tembolok.time < TTL_MS) {
    return tembolok.data;
  }

  const { data, error } = await supabase.rpc('list_chat_directory');
  if (error) throw error;
  const people = (data || [])
    .filter((person) => person.uid !== user.uid && typeof person.nama === 'string')
    .map((person) => ({
      uid: person.uid,
      nama: person.nama,
      role: person.role,
      sameInstansi: person.same_instansi === true,
      photoUrl: typeof person.photo_url === 'string' && /^https:\/\//i.test(person.photo_url)
        ? person.photo_url
        : '',
    }));
  tembolok = { key, time: Date.now(), data: people };
  return people;
}

export const hapusTembolokDirektori = () => { tembolok = null; };
