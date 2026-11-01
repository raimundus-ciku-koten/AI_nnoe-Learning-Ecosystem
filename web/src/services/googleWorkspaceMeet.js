import { requestGoogle } from './googleWorkspaceRequest.js';

const BASE_MEET = 'https://meet.googleapis.com/v2';

export function buatTautanGoogleCalendar({ judul, mulai, selesai, deskripsi = '' }) {
  const namaAcara = typeof judul === 'string' ? judul.trim() : '';
  const awal = new Date(mulai);
  const akhir = new Date(selesai);
  if (!namaAcara || Number.isNaN(awal.getTime()) || Number.isNaN(akhir.getTime()) || akhir <= awal) {
    throw new Error('Isi judul acara dan pastikan waktu selesai setelah waktu mulai.');
  }
  const formatWaktu = (date) => date.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '');
  const calendarUrl = new URL('https://calendar.google.com/calendar/render');
  calendarUrl.search = new URLSearchParams({
    action: 'TEMPLATE',
    text: namaAcara.slice(0, 120),
    dates: `${formatWaktu(awal)}/${formatWaktu(akhir)}`,
    details: typeof deskripsi === 'string' ? deskripsi.trim().slice(0, 2000) : '',
  }).toString();
  return calendarUrl.href;
}

export async function buatRuangGoogleMeet(accessToken) {
  const ruang = await requestGoogle(`${BASE_MEET}/spaces`, accessToken, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({}),
  });
  let meetingUrl;
  try {
    meetingUrl = new URL(ruang.meetingUri);
  } catch (error) {
    throw new Error('Google Meet tidak mengembalikan tautan rapat yang valid.', { cause: error });
  }
  if (meetingUrl.origin !== 'https://meet.google.com' || meetingUrl.username || meetingUrl.password) {
    throw new Error('Google Meet mengembalikan tautan rapat yang tidak aman.');
  }
  return { ...ruang, meetingUri: meetingUrl.href };
}
