const BASE_DRIVE = 'https://www.googleapis.com/drive/v3';
const BASE_UPLOAD = 'https://www.googleapis.com/upload/drive/v3';
const BASE_CALENDAR = 'https://www.googleapis.com/calendar/v3';
const BASE_GMAIL = 'https://gmail.googleapis.com/gmail/v1';
const BATAS_BERKAS = 10 * 1024 * 1024;

async function requestGoogle(url, token, options = {}) {
  const response = await fetch(url, {
    ...options,
    headers: {
      Authorization: `Bearer ${token}`,
      ...(options.headers || {}),
    },
    signal: AbortSignal.timeout(30000),
  });
  const raw = await response.text();
  let result = {};
  if (raw) {
    try {
      result = JSON.parse(raw);
    } catch (error) {
      if (response.ok) throw new Error('Respons Google API tidak dapat dibaca.');
    }
  }
  if (!response.ok) {
    const detail = result.error?.message || `Permintaan Google ditolak (HTTP ${response.status}).`;
    const error = new Error(detail);
    error.code = result.error?.status || 'google/api-error';
    error.status = response.status;
    throw error;
  }
  return result;
}

export async function unggahKeDrive(accessToken, berkas) {
  if (!berkas || !(berkas instanceof File)) throw new Error('Pilih berkas yang akan diunggah.');
  if (berkas.size > BATAS_BERKAS) throw new Error('Ukuran berkas maksimal 10 MB.');
  const metadata = new Blob([JSON.stringify({ name: berkas.name })], {
    type: 'application/json; charset=UTF-8',
  });
  const form = new FormData();
  form.append('metadata', metadata);
  form.append('file', berkas);
  return requestGoogle(`${BASE_UPLOAD}/files?uploadType=multipart&fields=id,name,webViewLink`, accessToken, {
    method: 'POST',
    body: form,
  });
}

export async function simpanFotoProfilDiDrive(accessToken, uid, berkas) {
  if (!/^[A-Za-z0-9_-]{1,128}$/.test(uid)) throw new Error('Akun pengguna tidak valid.');
  if (!berkas || !(berkas instanceof File) || berkas.type !== 'image/jpeg') {
    throw new Error('Foto profil harus berupa JPEG.');
  }
  if (berkas.size === 0 || berkas.size > BATAS_BERKAS) {
    throw new Error('Ukuran salinan foto profil tidak valid.');
  }

  const metadata = {
    name: 'AI_nnoe-profile-photo.jpg',
    mimeType: 'image/jpeg',
    appProperties: { aleKind: 'profile-photo', aleUid: uid },
  };
  const query = encodeURIComponent(
    `appProperties has { key='aleKind' and value='profile-photo' } and appProperties has { key='aleUid' and value='${uid}' } and trashed=false`,
  );
  const daftar = await requestGoogle(
    `${BASE_DRIVE}/files?q=${query}&pageSize=1&fields=files(id)`,
    accessToken,
  );
  const form = new FormData();
  form.append('metadata', new Blob([JSON.stringify(metadata)], {
    type: 'application/json; charset=UTF-8',
  }));
  form.append('file', berkas);

  const idLama = daftar.files?.[0]?.id;
  const endpoint = idLama
    ? `${BASE_UPLOAD}/files/${encodeURIComponent(idLama)}?uploadType=multipart&fields=id,name,webViewLink`
    : `${BASE_UPLOAD}/files?uploadType=multipart&fields=id,name,webViewLink`;
  return requestGoogle(endpoint, accessToken, {
    method: idLama ? 'PATCH' : 'POST',
    body: form,
  });
}

export async function buatAcaraCalendar(accessToken, { judul, mulai, selesai, deskripsi = '' }) {
  const awal = new Date(mulai);
  const akhir = new Date(selesai);
  if (!judul.trim() || Number.isNaN(awal.getTime()) || Number.isNaN(akhir.getTime()) || akhir <= awal) {
    throw new Error('Isi judul acara dan pastikan waktu selesai setelah waktu mulai.');
  }
  return requestGoogle(`${BASE_CALENDAR}/calendars/primary/events`, accessToken, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      summary: judul.trim().slice(0, 120),
      description: deskripsi.trim().slice(0, 2000),
      start: { dateTime: awal.toISOString() },
      end: { dateTime: akhir.toISOString() },
    }),
  });
}

function base64Url(teks) {
  const bytes = new TextEncoder().encode(teks);
  let binary = '';
  for (let offset = 0; offset < bytes.length; offset += 0x8000) {
    binary += String.fromCharCode(...bytes.subarray(offset, offset + 0x8000));
  }
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
}

export async function kirimEmailUji(accessToken, email) {
  const alamat = String(email || '').trim();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(alamat)) {
    throw new Error('Alamat email akun tidak valid.');
  }
  const raw = [
    `To: ${alamat}`,
    'Subject: AI_nnoe - Uji koneksi Gmail',
    'MIME-Version: 1.0',
    'Content-Type: text/plain; charset=UTF-8',
    '',
    'Email uji koneksi Gmail AI_nnoe berhasil dikirim ke akun Anda sendiri.',
  ].join('\r\n');
  return requestGoogle(`${BASE_GMAIL}/users/me/messages/send`, accessToken, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ raw: base64Url(raw) }),
  });
}
