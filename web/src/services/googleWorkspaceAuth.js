const GIS_SCRIPT_URL = 'https://accounts.google.com/gsi/client';
const DRIVE_SCOPES = [
  'openid',
  'email',
  'https://www.googleapis.com/auth/drive.file',
].join(' ');
const DRIVE_FILE_SCOPE = 'https://www.googleapis.com/auth/drive.file';
const SHEETS_SCOPES = ['openid', 'email', DRIVE_FILE_SCOPE].join(' ');
const MEET_SCOPES = [
  'openid',
  'email',
  'https://www.googleapis.com/auth/meetings.space.created',
].join(' ');

let gisLoading;
let workspaceSession = null;

function loadGoogleIdentityServices() {
  if (globalThis.google?.accounts?.oauth2) return Promise.resolve(globalThis.google);
  if (gisLoading) return gisLoading;
  if (typeof document === 'undefined') {
    return Promise.reject(new Error('Google Workspace OAuth hanya tersedia di browser.'));
  }

  gisLoading = new Promise((resolve, reject) => {
    const existing = document.querySelector(`script[src="${GIS_SCRIPT_URL}"]`);
    const script = existing || document.createElement('script');
    const timeout = setTimeout(() => {
      gisLoading = null;
      script.remove();
      reject(new Error('Google Identity Services tidak merespons.'));
    }, 15000);
    const cleanup = () => {
      clearTimeout(timeout);
      script.removeEventListener('load', onLoad);
      script.removeEventListener('error', onError);
    };
    const onLoad = () => {
      cleanup();
      if (!globalThis.google?.accounts?.oauth2) {
        gisLoading = null;
        script.remove();
        reject(new Error('Google Identity Services tidak tersedia setelah dimuat.'));
        return;
      }
      resolve(globalThis.google);
    };
    const onError = () => {
      cleanup();
      gisLoading = null;
      script.remove();
      reject(new Error('Google Identity Services gagal dimuat. Periksa koneksi atau kebijakan jaringan.'));
    };

    script.addEventListener('load', onLoad, { once: true });
    script.addEventListener('error', onError, { once: true });
    if (!existing) {
      script.src = GIS_SCRIPT_URL;
      script.async = true;
      script.defer = true;
      document.head.append(script);
    }
  });
  return gisLoading;
}

export async function hubungkanGoogleWorkspaceLangsung(
  clientId,
  expectedEmail,
  scopes = DRIVE_SCOPES,
  { includeGrantedScopes = false } = {},
) {
  const oauthClientId = String(clientId || '').trim();
  const emailYangDiharapkan = String(expectedEmail || '').trim().toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(emailYangDiharapkan)) {
    throw new Error('Alamat email akun aplikasi tidak valid.');
  }
  if (!/^[0-9]+-[a-z0-9-]+\.apps\.googleusercontent\.com$/i.test(oauthClientId)) {
    throw new Error('Atur VITE_GOOGLE_OAUTH_CLIENT_ID dengan Web OAuth Client ID Google yang valid.');
  }

  const google = await loadGoogleIdentityServices();
  const tokenResult = await new Promise((resolve, reject) => {
    let settled = false;
    const timeout = setTimeout(() => {
      if (!settled) {
        settled = true;
        reject(new Error('Persetujuan Google tidak selesai dalam waktu yang ditentukan.'));
      }
    }, 120000);
    const finish = (callback, value) => {
      if (settled) return;
      settled = true;
      clearTimeout(timeout);
      callback(value);
    };
    try {
      const tokenClient = google.accounts.oauth2.initTokenClient({
        client_id: oauthClientId,
        scope: scopes,
        include_granted_scopes: includeGrantedScopes,
        callback: (response) => {
          if (response.error) {
            finish(reject, new Error(`Google menolak izin layanan (${response.error}).`));
            return;
          }
          finish(resolve, response);
        },
        error_callback: (error) => {
          finish(reject, new Error(
            error.type === 'popup_closed'
              ? 'Jendela persetujuan Google ditutup sebelum selesai.'
              : 'Google tidak dapat membuka jendela persetujuan.',
          ));
        },
      });
      tokenClient.requestAccessToken({
        prompt: 'consent',
        login_hint: emailYangDiharapkan,
      });
    } catch (error) {
      finish(reject, error);
    }
  });

  if (typeof tokenResult.access_token !== 'string' || !tokenResult.access_token ||
      !Number.isFinite(Number(tokenResult.expires_in)) || Number(tokenResult.expires_in) <= 60) {
    throw new Error('Google tidak mengembalikan access token yang valid.');
  }
  const grantedScopes = new Set(String(tokenResult.scope || '').split(/\s+/).filter(Boolean));
  const requiredScopes = scopes.split(' ');
  if (!requiredScopes.every((scope) => grantedScopes.has(scope))) {
    throw new Error('Akses Google Workspace belum disetujui. Hubungkan ulang dan setujui semua cakupan yang diminta.');
  }

  const response = await fetch('https://www.googleapis.com/oauth2/v3/userinfo', {
    headers: { Authorization: `Bearer ${tokenResult.access_token}` },
    signal: AbortSignal.timeout(15000),
  });
  if (!response.ok) {
    throw new Error(`Identitas akun Google tidak dapat diverifikasi (HTTP ${response.status}).`);
  }
  const profile = await response.json();
  const googleEmail = String(profile.email || '').trim().toLowerCase();
  if (profile.email_verified !== true || googleEmail !== emailYangDiharapkan) {
    throw new Error('Gunakan akun Google terverifikasi dengan alamat email yang sama seperti akun AI_nnoe.');
  }

  return {
    accessToken: tokenResult.access_token,
    email: googleEmail,
    expiresAt: Date.now() + Number(tokenResult.expires_in) * 1000,
  };
}

export async function hubungkanGoogleWorkspaceUntukPengguna(
  user,
  clientId = import.meta.env?.VITE_GOOGLE_OAUTH_CLIENT_ID,
) {
  const userId = String(user?.id || user?.uid || '').trim();
  if (!userId) throw new Error('Identitas pengguna aplikasi tidak tersedia.');
  const session = await hubungkanGoogleWorkspaceLangsung(
    clientId,
    user.email,
  );
  workspaceSession = { ...session, userId };
  return workspaceSession;
}

export async function hubungkanGoogleDriveUntukPengguna(
  user,
  clientId = import.meta.env?.VITE_GOOGLE_OAUTH_CLIENT_ID,
) {
  const userId = String(user?.id || user?.uid || '').trim();
  if (!userId) throw new Error('Identitas pengguna aplikasi tidak tersedia.');
  const session = await hubungkanGoogleWorkspaceLangsung(
    clientId,
    user.email,
    DRIVE_FILE_SCOPE,
  );
  workspaceSession = { ...session, userId };
  return workspaceSession;
}

export async function hubungkanGoogleSheetsUntukPengguna(
  user,
  clientId = import.meta.env?.VITE_GOOGLE_OAUTH_CLIENT_ID,
) {
  const userId = String(user?.id || user?.uid || '').trim();
  if (!userId) throw new Error('Identitas pengguna aplikasi tidak tersedia.');
  const session = await hubungkanGoogleWorkspaceLangsung(
    clientId,
    user.email,
    SHEETS_SCOPES,
    { includeGrantedScopes: false },
  );
  return { ...session, userId };
}

export async function hubungkanGoogleMeetUntukPengguna(
  user,
  clientId = import.meta.env?.VITE_GOOGLE_OAUTH_CLIENT_ID,
) {
  const userId = String(user?.id || user?.uid || '').trim();
  if (!userId) throw new Error('Identitas pengguna aplikasi tidak tersedia.');
  return {
    ...await hubungkanGoogleWorkspaceLangsung(
      clientId,
      user.email,
      MEET_SCOPES,
      { includeGrantedScopes: false },
    ),
    userId,
  };
}

export function tokenGoogleWorkspacePerPengguna(userId) {
  if (!userId || workspaceSession?.userId !== userId ||
      workspaceSession.expiresAt <= Date.now()) {
    workspaceSession = null;
    return '';
  }
  return workspaceSession.accessToken;
}

export function sesiGoogleWorkspacePerPengguna(userId) {
  const accessToken = tokenGoogleWorkspacePerPengguna(userId);
  return accessToken ? { ...workspaceSession } : null;
}

export function hapusSesiGoogleWorkspace(userId) {
  if (!userId || workspaceSession?.userId === userId) workspaceSession = null;
}
