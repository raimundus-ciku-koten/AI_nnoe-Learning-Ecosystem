import { supabase } from './lib/supabase.ts';
import { setState, getState } from './state.js';
import { simpanProfil, hapusProfil } from './ui.js';
import { normalisasiNama } from './utils/nama.js';

const BATAS_LOGIN_MS = 20000;
const googleScopes = [
  'openid',
  'email',
  'profile',
  'https://www.googleapis.com/auth/drive.file',
  'https://www.googleapis.com/auth/calendar.events.owned',
  'https://www.googleapis.com/auth/gmail.send',
].join(' ');

const STATE_KOSONG = Object.freeze({
  user: null,
  profile: null,
  role: null,
  tenantId: null,
  isDemo: false,
  claims: null,
  sesiMemuat: false,
});

let versiSesi = 0;
let workspaceSession = null;

function buatError(message, code, cause) {
  return Object.assign(new Error(message, cause ? { cause } : undefined), { code });
}

function userAplikasi(authUser, profile) {
  const appMetadata = authUser.app_metadata || {};
  const role = profile.role || appMetadata.role || null;
  const tenantId = profile.tenant_id || appMetadata.tenant_id || null;
  const nama = typeof profile.nama === 'string' ? profile.nama.trim() : '';
  const photoURL = typeof profile.photo_url === 'string' ? profile.photo_url : '';

  return {
    user: {
      uid: authUser.id,
      id: authUser.id,
      email: authUser.email || '',
      displayName: nama || authUser.user_metadata?.full_name || authUser.email?.split('@')[0] || 'Pengguna',
      photoURL: photoURL || authUser.user_metadata?.avatar_url || '',
    },
    profile: {
      nama,
      sekolah: '',
      langganan: false,
      logoSekolah: '',
    },
    role,
    tenantId,
    isDemo: role === 'demo',
    claims: { ...appMetadata, role, tenantId, active: profile.active === true },
    authReady: true,
  };
}

async function bacaProfil(authUser) {
  const { data, error } = await supabase
    .from('profiles')
    .select('id,email,nama,role,tenant_id,photo_url,active')
    .eq('id', authUser.id)
    .maybeSingle();
  if (error) throw error;
  if (!data) throw buatError('Profil pengguna Supabase tidak ditemukan.', 'auth/profile-not-found');
  return data;
}

function pastikanAktif(profile) {
  if (profile.active !== true || !profile.role || profile.role === 'unprovisioned') {
    throw buatError(
      'Akun belum diaktifkan atau belum mendapat peran. Hubungi administrator.',
      'auth/workspace-account-not-provisioned',
    );
  }
}

async function validasiSesi(authUser) {
  if (!authUser) throw buatError('Sesi Supabase tidak ditemukan.', 'auth/not-authenticated');
  const profile = await bacaProfil(authUser);
  pastikanAktif(profile);
  return { profile, appState: userAplikasi(authUser, profile) };
}

async function denganBatas(promise, milliseconds) {
  let timer;
  try {
    return await Promise.race([
      promise,
      new Promise((_, reject) => {
        timer = setTimeout(() => reject(
          buatError('Koneksi ke server autentikasi terlalu lama.', 'auth/network-request-failed'),
        ), milliseconds);
      }),
    ]);
  } finally {
    clearTimeout(timer);
  }
}

export async function login(email, password) {
  const { data, error } = await denganBatas(
    supabase.auth.signInWithPassword({ email: email.trim(), password }),
    BATAS_LOGIN_MS,
  );
  if (error) throw error;
  try {
    await validasiSesi(data.user);
  } catch (cause) {
    const { error: signOutError } = await supabase.auth.signOut();
    if (signOutError) console.error('[auth] Gagal membersihkan sesi yang belum diotorisasi:', signOutError);
    throw cause;
  }
  return data.user;
}

export async function logout() {
  const uid = getState().user?.uid;
  workspaceSession = null;
  try {
    const { clearBrowserAiSession } = await import('./services/browserAi.js');
    clearBrowserAiSession(uid);
  } catch (error) {
    console.error('[auth] Gagal membersihkan kunci AI dari memori sesi:', error);
  }

  const { error } = await supabase.auth.signOut();
  if (error) throw error;
  setState({ ...STATE_KOSONG, authReady: true });
  if (uid) hapusProfil(uid);
}

export function resetPassword(email) {
  return supabase.auth.resetPasswordForEmail(email.trim(), {
    redirectTo: `${window.location.origin}${window.location.pathname}#/reset-password`,
  }).then(({ error }) => {
    if (error) throw error;
  });
}

export async function masukGoogle() {
  const { error } = await supabase.auth.signInWithOAuth({
    provider: 'google',
    options: {
      redirectTo: `${window.location.origin}${window.location.pathname}`,
      scopes: 'openid email profile',
      queryParams: { prompt: 'select_account' },
    },
  });
  if (error) throw error;
}

export async function hubungkanGoogleWorkspace() {
  const { data: { user }, error: userError } = await supabase.auth.getUser();
  if (userError) throw userError;
  if (!user) throw buatError('Masuk terlebih dahulu.', 'auth/not-authenticated');

  const { error } = await supabase.auth.signInWithOAuth({
    provider: 'google',
    options: {
      redirectTo: `${window.location.origin}${window.location.pathname}`,
      scopes: googleScopes,
      queryParams: { prompt: 'consent', access_type: 'online' },
    },
  });
  if (error) throw error;
  return null;
}

export function tokenGoogleWorkspaceAktif() {
  if (
    !workspaceSession
    || workspaceSession.uid !== getState().user?.uid
    || workspaceSession.expiresAt <= Date.now()
  ) {
    workspaceSession = null;
    return '';
  }
  return workspaceSession.accessToken;
}

export function pantaulogin(onReady, onUbah) {
  let aktif = true;
  let unsubscribe;
  const langganan = supabase.auth.onAuthStateChange((event, session) => {
    const saya = ++versiSesi;
    queueMicrotask(async () => {
      if (!aktif || saya !== versiSesi) return;
      const authUser = session?.user || null;
      if (!authUser) {
        workspaceSession = null;
        setState({ ...STATE_KOSONG, authReady: true });
        onReady?.(null);
        return;
      }

      try {
        const { profile, appState } = await validasiSesi(authUser);
        if (!aktif || saya !== versiSesi) return;

        const previous = getState();
        setState(appState);
        simpanProfil(authUser.id, appState.profile);
        onReady?.(authUser);
        if (event === 'SIGNED_IN' && session.provider_token) {
          workspaceSession = {
            accessToken: session.provider_token,
            email: authUser.email || '',
            expiresAt: Date.now() + 45 * 60 * 1000,
            uid: authUser.id,
          };
        }
        if (previous.role !== appState.role || previous.tenantId !== appState.tenantId) onUbah?.();
      } catch (error) {
        if (!aktif || saya !== versiSesi) return;
        console.error('[auth] Gagal memvalidasi sesi atau profil Supabase:', error);
        if (event === 'SIGNED_IN' || event === 'TOKEN_REFRESHED') {
          const { error: signOutError } = await supabase.auth.signOut();
          if (signOutError) console.error('[auth] Gagal menutup sesi yang tidak valid:', signOutError);
        }
        setState({ ...STATE_KOSONG, authReady: true });
        onReady?.(null);
      }
    });
  });
  unsubscribe = langganan.data.subscription.unsubscribe;
  return () => {
    aktif = false;
    unsubscribe();
  };
}

export async function updateProfil({ nama, photoURL }) {
  const { data: { user }, error: userError } = await supabase.auth.getUser();
  if (userError) throw userError;
  if (!user) throw buatError('Belum login.', 'auth/not-authenticated');

  const namaBaru = nama ? normalisasiNama(nama) : '';
  const updates = {};
  if (namaBaru) updates.nama = namaBaru;
  if (photoURL) updates.photo_url = photoURL;

  if (Object.keys(updates).length) {
    const { error } = await supabase.from('profiles').update(updates).eq('id', user.id);
    if (error) throw error;
  }

  const metadata = {};
  if (namaBaru) metadata.full_name = namaBaru;
  if (photoURL) metadata.avatar_url = photoURL;
  if (Object.keys(metadata).length) {
    const { error } = await supabase.auth.updateUser({ data: metadata });
    if (error) throw error;
  }

  const current = getState();
  const userProfile = {
    ...current.profile,
    ...(namaBaru ? { nama: namaBaru } : {}),
  };
  setState({
    user: {
      ...current.user,
      ...(namaBaru ? { displayName: namaBaru } : {}),
      ...(photoURL ? { photoURL } : {}),
    },
    profile: userProfile,
  });
  simpanProfil(user.id, userProfile);
}
