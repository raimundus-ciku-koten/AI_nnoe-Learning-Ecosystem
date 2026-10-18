import { supabase } from '../lib/supabase.ts';
import { setState } from '../state.js';
import {
  hapusLampiranChatDriveSetelahGagal,
  unggahLampiranChatDrive,
  unduhLampiranChatDrive,
} from './googleWorkspace.js';
import {
  MAKS_BERKAS, MAKS_JUDUL, MAKS_ANGGOTA_GRUP, MAKS_TEKS,
  idValid, periksaBerkas, ringkas
} from '../utils/chatUtil.js';

export { MAKS_BERKAS, urlAman } from '../utils/chatUtil.js';

const channelId = () => globalThis.crypto?.randomUUID?.() || String(Date.now());
const millis = (value) => value ? new Date(value).getTime() : 0;

function dariBarisPesan(row) {
  return {
    id: row.id,
    senderId: row.sender_id,
    type: row.type,
    text: row.body || '',
    fileName: row.file_name || '',
    fileSize: row.file_size || 0,
    fileId: row.drive_file_index_id || '',
    ts: millis(row.created_at),
  };
}

export async function muatDaftarChat() {
  const { data, error } = await supabase
    .from('chat_inbox')
    .select('conversation_id,user_id,type,name,peer_user_id,last_text,last_message_at,last_sender_id,unread_count')
    .order('last_message_at', { ascending: false });
  if (error) throw error;

  const daftar = (data || []).map((row) => ({
    id: row.conversation_id,
    type: row.type,
    name: row.name,
    peerUid: row.peer_user_id,
    lastText: row.last_text || '',
    lastTs: millis(row.last_message_at),
    lastSender: row.last_sender_id,
    unread: Number(row.unread_count) || 0,
  }));
  setState({
    chats: daftar,
    unreadChats: daftar.reduce((total, chat) => total + chat.unread, 0),
  });
  return daftar;
}

/* ---------- MEMBUAT PERCAKAPAN ---------- */

export async function mulaiChatPribadi(saya, teman) {
  const { data: existing, error: lookupError } = await supabase
    .from('chat_conversations')
    .select('id')
    .eq('type', 'direct')
    .contains('participant_ids', [saya.uid, teman.uid])
    .order('created_at', { ascending: true })
    .limit(1);
  if (lookupError) throw lookupError;
  if (existing?.[0]) return existing[0].id;

  const names = {
    [saya.uid]: ringkas(saya.nama, 80),
    [teman.uid]: ringkas(teman.nama, 80),
  };
  const { data, error } = await supabase
    .from('chat_conversations')
    .insert({
      type: 'direct',
      participant_ids: [saya.uid, teman.uid].sort(),
      participant_names: names,
      created_by: saya.uid,
    })
    .select('id')
    .single();
  if (error) throw error;
  return data.id;
}

export async function buatGrup(saya, nama, anggota) {
  const judul = ringkas(nama, MAKS_JUDUL);
  if (!judul) throw new Error('Nama grup wajib diisi.');
  const lain = anggota.filter((member) => member.uid !== saya.uid);
  if (lain.length < 1) throw new Error('Pilih minimal satu anggota.');
  if (lain.length + 1 > MAKS_ANGGOTA_GRUP) {
    throw new Error(`Grup maksimal ${MAKS_ANGGOTA_GRUP} anggota.`);
  }

  const participants = [saya, ...lain];
  const { data, error } = await supabase
    .from('chat_conversations')
    .insert({
      type: 'group',
      title: judul,
      participant_ids: participants.map((member) => member.uid).sort(),
      participant_names: Object.fromEntries(
        participants.map((member) => [member.uid, ringkas(member.nama, 80)]),
      ),
      created_by: saya.uid,
    })
    .select('id')
    .single();
  if (error) throw error;
  return data.id;
}

export async function ambilMeta(chatId) {
  if (!idValid(chatId)) return null;
  const { data, error } = await supabase
    .from('chat_conversations')
    .select('id,type,title,participant_ids,participant_names')
    .eq('id', chatId)
    .maybeSingle();
  if (error) throw error;
  if (!data) return null;
  return {
    type: data.type,
    name: data.title,
    members: Object.fromEntries(data.participant_ids.map((uid) => [uid, true])),
    names: data.participant_names || {},
  };
}

/* ---------- MENGIRIM ---------- */

async function kirimNotifikasiPesan(messageId) {
  try {
    const { data, error } = await supabase.functions.invoke('chat-push', {
      body: { messageId },
    });
    if (error) {
      console.error('[chat] notifikasi push gagal dikirim:', error);
    } else if (data?.failed > 0) {
      console.error(`[chat] ${data.failed} notifikasi push gagal dikirim.`);
    }
  } catch (error) {
    console.error('[chat] notifikasi push gagal dikirim:', error);
  }
}

export async function kirimPesan(chatId, uidSaya, semuaAnggota, isi) {
  if (isi.type !== 'text') {
    throw new Error('Kirim lampiran melalui alur upload terenkripsi.');
  }
  const teks = String(isi.text ?? '').slice(0, MAKS_TEKS);
  if (!teks.trim()) throw new Error('Pesan kosong.');
  const { data, error } = await supabase
    .from('chat_messages')
    .insert({
      conversation_id: chatId,
      sender_id: uidSaya,
      type: 'text',
      body: teks,
    })
    .select('id')
    .single();
  if (error) throw error;
  await kirimNotifikasiPesan(data.id);
  return data.id;
}

export async function unggahBerkas(chatId, uidSaya, berkas, accessToken, identity) {
  const check = periksaBerkas(berkas);
  if (!check.ok) throw new Error(check.alasan);
  if (!idValid(chatId) || typeof uidSaya !== 'string' ||
      typeof accessToken !== 'string' || !accessToken.trim() ||
      !identity?.privateKey || identity.privateKey.type !== 'private' ||
      identity.userId !== uidSaya) {
    throw new TypeError('Sesi Drive atau identitas enkripsi lampiran tidak valid.');
  }

  const { data: recipients, error: recipientError } = await supabase.rpc(
    'list_chat_attachment_recipients',
    { p_conversation_id: chatId },
  );
  if (recipientError) throw recipientError;
  if (!Array.isArray(recipients) || recipients.length < 2 ||
      recipients.length > MAKS_ANGGOTA_GRUP) {
    throw new Error('Daftar penerima lampiran tidak valid.');
  }
  const ownKey = recipients.find((recipient) => recipient.user_id === uidSaya);
  if (!ownKey || ownKey.fingerprint !== identity.fingerprint ||
      ownKey.key_version !== identity.keyVersion ||
      ownKey.public_key !== identity.publicKey) {
    throw new Error('Kunci vault aktif belum terdaftar untuk akun ini. Siapkan ulang kunci di Google Workspace.');
  }
  const otherRecipients = recipients
    .filter((recipient) => recipient.user_id !== uidSaya)
    .map((recipient) => ({
      userId: recipient.user_id,
      email: recipient.email,
      publicKey: recipient.public_key,
      fingerprint: recipient.fingerprint,
      keyVersion: recipient.key_version,
    }));

  const saved = await unggahLampiranChatDrive(
    accessToken,
    uidSaya,
    identity,
    berkas,
    otherRecipients,
  );
  const identityWithUser = { ...identity, userId: uidSaya };
  const { data, error } = await supabase.rpc('register_chat_drive_attachment', {
    p_conversation_id: chatId,
    p_drive_file_id: saved.driveFileId,
    p_ciphertext_sha256: saved.manifest.ciphertextSha256,
    p_ciphertext_size_bytes: saved.manifest.ciphertextSizeBytes,
    p_encryption_version: saved.manifest.version,
    p_message_type: check.jenis,
    p_source_file_size: berkas.size,
    p_key_envelopes: saved.manifest.keyEnvelopes,
  });
  if (error) {
    const { data: registeredFile, error: lookupError } = await supabase
      .from('drive_file_index')
      .select('id')
      .eq('owner_id', uidSaya)
      .eq('drive_file_id', saved.driveFileId)
      .maybeSingle();
    if (lookupError) {
      throw new AggregateError(
        [error, lookupError],
        'Status pendaftaran lampiran tidak dapat dipastikan. Berkas Drive dipertahankan agar pesan tersimpan tidak rusak.',
        { cause: error },
      );
    }
    if (registeredFile) {
      const { data: registeredMessage, error: messageError } = await supabase
        .from('chat_messages')
        .select('id')
        .eq('drive_file_index_id', registeredFile.id)
        .maybeSingle();
      if (messageError) {
        throw new AggregateError(
          [error, messageError],
          'Status pesan lampiran tidak dapat dipastikan. Berkas Drive dipertahankan.',
          { cause: error },
        );
      }
      if (registeredMessage?.id) {
        await kirimNotifikasiPesan(registeredMessage.id);
        return registeredMessage.id;
      }
      throw new Error('Indeks lampiran ditemukan tanpa pesan terkait. Berkas Drive dipertahankan untuk pemeriksaan.', {
        cause: error,
      });
    }
    try {
      await hapusLampiranChatDriveSetelahGagal(accessToken, saved.driveFileId, identityWithUser);
    } catch (cleanupError) {
      throw new AggregateError(
        [error, cleanupError],
        'Lampiran gagal didaftarkan dan berkas Drive tidak dapat dibersihkan. Periksa Drive sebelum mencoba lagi.',
        { cause: error },
      );
    }
    throw error;
  }

  const messageId = Array.isArray(data) ? data[0]?.message_id : data?.message_id;
  if (typeof messageId !== 'string') {
    throw new Error('Supabase tidak mengembalikan ID pesan lampiran yang valid.');
  }
  await kirimNotifikasiPesan(messageId);
  return messageId;
}

export async function ambilLampiran(messageId, chatId, uid, accessToken, identity, signal) {
  if (typeof messageId !== 'string' || !idValid(chatId) ||
      typeof uid !== 'string' || identity?.userId !== uid) {
    throw new TypeError('Identitas pesan lampiran tidak valid.');
  }
  const { data: message, error: messageError } = await supabase
    .from('chat_messages')
    .select('id,conversation_id,type,file_size,drive_file_index_id')
    .eq('id', messageId)
    .eq('conversation_id', chatId)
    .maybeSingle();
  if (messageError) throw messageError;
  if (!message || !['image', 'file'].includes(message.type) ||
      !message.drive_file_index_id) {
    throw new Error('Pesan ini tidak memiliki lampiran aktif.');
  }
  const { data: file, error: fileError } = await supabase
    .from('drive_file_index')
    .select('id,drive_file_id,category,ciphertext_sha256,ciphertext_size_bytes,encryption_version,revoked_at')
    .eq('id', message.drive_file_index_id)
    .maybeSingle();
  if (fileError) throw fileError;
  if (!file || file.category !== 'communication' || file.revoked_at) {
    throw new Error('Indeks lampiran tidak aktif atau tidak valid.');
  }
  const { data: envelope, error: envelopeError } = await supabase
    .from('drive_file_key_envelopes')
    .select('wrapped_data_key,recipient_key_fingerprint,key_version,revoked_at')
    .eq('file_id', file.id)
    .eq('recipient_id', uid)
    .maybeSingle();
  if (envelopeError) throw envelopeError;
  if (!envelope || envelope.revoked_at ||
      envelope.recipient_key_fingerprint !== identity.fingerprint ||
      envelope.key_version !== identity.keyVersion) {
    throw new Error('Kunci vault aktif tidak dapat membuka lampiran ini.');
  }

  const content = await unduhLampiranChatDrive(
    accessToken,
    file.drive_file_id,
    {
      ciphertextSha256: file.ciphertext_sha256,
      ciphertextSizeBytes: Number(file.ciphertext_size_bytes),
      encryptionVersion: file.encryption_version,
      fileSize: Number(message.file_size),
      type: message.type,
      wrappedDataKey: envelope.wrapped_data_key,
    },
    identity,
    signal,
  );
  const objectUrl = URL.createObjectURL(new Blob([content.bytes], { type: content.mimeType }));
  content.bytes.fill(0);
  return { url: objectUrl, fileName: content.name, mimeType: content.mimeType };
}

/* ---------- MEMBACA & MENDENGARKAN ---------- */

export function mulaiPantauDaftar() {
  let aktif = true;
  void muatDaftarChat().catch((error) => {
    if (aktif) console.error('[chat] daftar percakapan gagal dimuat:', error);
  });
  return () => { aktif = false; };
}

export function pantauPesan(chatId, onTambah, jumlah = 50) {
  const channel = supabase
    .channel(`chat-messages:${chatId}:${channelId()}`)
    .on('postgres_changes', {
      event: 'INSERT',
      schema: 'public',
      table: 'chat_messages',
      filter: `conversation_id=eq.${chatId}`,
    }, (payload) => onTambah(dariBarisPesan(payload.new)))
    .subscribe((status, error) => {
      if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') {
        console.error('[chat] langganan pesan gagal:', error || status);
      }
    });

  void supabase
    .from('chat_messages')
    .select('id,sender_id,type,body,drive_file_index_id,file_name,file_size,created_at')
    .eq('conversation_id', chatId)
    .order('created_at', { ascending: false })
    .order('id', { ascending: false })
    .limit(jumlah)
    .then(({ data, error }) => {
      if (error) {
        console.error('[chat] pesan gagal dimuat:', error);
        return;
      }
      (data || []).reverse().forEach((row) => onTambah(dariBarisPesan(row)));
    });
  return () => { void supabase.removeChannel(channel); };
}

export async function muatPesanLama(chatId, sebelumId, jumlah = 30) {
  const { data: cursor, error: cursorError } = await supabase
    .from('chat_messages')
    .select('created_at')
    .eq('conversation_id', chatId)
    .eq('id', sebelumId)
    .single();
  if (cursorError) throw cursorError;

  const { data, error } = await supabase
    .from('chat_messages')
    .select('id,sender_id,type,body,drive_file_index_id,file_name,file_size,created_at')
    .eq('conversation_id', chatId)
    .or(`created_at.lt.${cursor.created_at},and(created_at.eq.${cursor.created_at},id.lt.${sebelumId})`)
    .order('created_at', { ascending: false })
    .order('id', { ascending: false })
    .limit(jumlah);
  if (error) throw error;
  return (data || []).reverse().map(dariBarisPesan);
}

/* ---------- TANDA BACA ---------- */

export async function tandaiDibaca(chatId, uid) {
  const { error } = await supabase
    .from('chat_read_receipts')
    .upsert({
      conversation_id: chatId,
      user_id: uid,
      last_read_at: new Date().toISOString(),
    }, { onConflict: 'conversation_id,user_id' });
  if (error) throw error;
}

export function pantauBacaan(chatId, callback) {
  let aktif = true;
  const terapkan = (rows) => {
    callback(Object.fromEntries(
      (rows || []).map((row) => [row.user_id, millis(row.last_read_at)]),
    ));
  };
  const channel = supabase
    .channel(`chat-reads:${chatId}:${channelId()}`)
    .on('postgres_changes', {
      event: '*',
      schema: 'public',
      table: 'chat_read_receipts',
      filter: `conversation_id=eq.${chatId}`,
    }, () => {
      void supabase
        .from('chat_read_receipts')
        .select('user_id,last_read_at')
        .eq('conversation_id', chatId)
        .then(({ data, error }) => {
          if (error) console.error('[chat] tanda baca gagal dimuat:', error);
          else if (aktif) terapkan(data);
        });
    })
    .subscribe((status, error) => {
      if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') {
        console.error('[chat] langganan tanda baca gagal:', error || status);
      }
    });
  void supabase
    .from('chat_read_receipts')
    .select('user_id,last_read_at')
    .eq('conversation_id', chatId)
    .then(({ data, error }) => {
      if (error) console.error('[chat] tanda baca gagal dimuat:', error);
      else if (aktif) terapkan(data);
    });
  return () => {
    aktif = false;
    void supabase.removeChannel(channel);
  };
}
