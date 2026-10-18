// web/src/auth.js
import { supabase } from './lib/supabase.ts';
import { setState, getState, tunggu } from './state.js';
import { simpanProfil, hapusProfil } from './ui.js';
import { normalisasiNama } from './utils/nama.js';
import { hapusSesiGoogleWorkspace } from './services/googleWorkspaceAuth.js';
import { hapusIdentitasEnkripsiDriveDalamSesi } from './services/driveEncryption.js';

const BATAS_LOGIN_MS = 20000;
const BATAS_PROFIL_MS = 6000;
const BATAS_SESI_MS = 8000;

const STATE_KOSONG = Object.freeze({
  user: null, profile: null, role: null, activeRole: null, roles: [], tenantId: null,
  isDemo: false, claims: null, sesiMemuat: false,
});

const teks = (v) => (typeof v === 'string' ? v.trim() : '');

function ringkasProfil(profil = {}) {
  return {
    nama: teks(profil.nama),
    sekolah: teks(profil.instansi || profil.sekolah),
    langganan: profil.langganan === true || profil.langganan === 'aktif',
    logoSekolah: teks(profil.logoSekolah),
  };
}

function rakitState(user, claims = {}, profil = {}) {
  const ringkas = ringkasProfil(profil);
  simpanProfil(user.id, ringkas);

  const activeRole = claims.role || profil.role || null;
  const role = ['guru_bk', 'guru_kokurikuler', 'guru_ekstrakurikuler'].includes(activeRole)
    ? 'guru'
    : activeRole;
  const roles = Array.isArray(claims.roles) && claims.roles.length
    ? [...new Set(claims.roles.filter((candidate) => typeof candidate === 'string'))]
    : (role ? [role] : []);
  const userOut = {
    uid: user.id,
    email: user.email || '',
    displayName: ringkas.nama || user.user_metadata?.nama || user.email?.split('@')[0] || 'Pengguna',
    photoURL: teks(profil.photoUrl) || user.user_metadata?.avatar_url || '',
  };

  return {
    user: userOut,
    profile: ringkas,
    role,
    activeRole,
    roles,
    tenantId: claims.tenantId || claims.tenant_id || profil.tenant_id || profil.tenantId || null,
    isDemo: role === 'demo' || claims.isDemo === true,
    claims,
    authReady: true,
  };
}

async function ambilProfil(uid) {
  const { data, error } = await supabase
    .from('profiles')
    .select('id,email,nama,role,tenant_id,instansi,active,logo_sekolah,photo_url')
    .eq('id', uid)
    .maybeSingle();

  if (error) {
    console.warn('[auth] profil Supabase tidak dapat dibaca:', error.message);
    return {};
  }

  return data || {};
}

export async function login(email, sandi, captchaToken) {
  const credentials = { email, password: sandi };
  if (captchaToken) credentials.options = { captchaToken };
  const { data, error } = await supabase.auth.signInWithPassword(credentials);
  if (error) throw error;
  return data.user;
}

export async function logout() {
  const uid = getState().user?.uid;
  hapusSesiGoogleWorkspace(uid);
  hapusIdentitasEnkripsiDriveDalamSesi(uid);
  try {
    const { clearBrowserAiSession } = await import('./services/browserAi.js');
    clearBrowserAiSession(uid);
  } catch (err) {
    console.error('[auth] Gagal membersihkan kunci AI dari memori sesi:', err);
  }

  try {
    await supabase.auth.signOut();
  } catch (err) {
    console.warn('[auth] signOut gagal, state tetap dikosongkan:', err?.message || err);
  }

  setState({ ...STATE_KOSONG });

  if (uid) {
    try { hapusProfil(uid); } catch { /* abaikan */ }
  }
}

export function resetPassword(email, captchaToken) {
  const redirectTo = `${window.location.origin}${window.location.pathname}#/login`;
  return supabase.auth.resetPasswordForEmail(email, { redirectTo, ...(captchaToken ? { captchaToken } : {}) });
}

export async function masukGoogle(captchaToken) {
  const redirectTo = `${window.location.origin}${window.location.pathname}#/login`;
  const { error } = await supabase.auth.signInWithOAuth({
    provider: 'google',
    options: { redirectTo, ...(captchaToken ? { captchaToken } : {}) },
  });
  if (error) throw error;
}

export async function switchRole(role) {
  const current = getState();
  if (!current.user?.uid) throw new Error('Belum login.');
  if (typeof role !== 'string' || !current.roles?.includes(role)) {
    throw new Error('Peran tersebut tidak diberikan kepada akun ini.');
  }
  if (current.activeRole === role) return;

  const { data: identity, error: identityError } = await supabase.auth.getUser();
  if (identityError) throw identityError;
  if (!identity.user) throw new Error('Identitas akun tidak tersedia.');
  const { data: userData, error: updateError } = await supabase.auth.updateUser({
    data: { ...identity.user.user_metadata, active_role: role },
  });
  if (updateError) throw updateError;
  if (!userData.user) throw new Error('Supabase Auth tidak mengembalikan identitas akun.');

  const { data: sessionData, error: refreshError } = await supabase.auth.refreshSession();
  if (refreshError) throw refreshError;
  const user = sessionData.session?.user;
  if (!user || user.app_metadata?.role !== role) {
    throw new Error('Server belum mengesahkan peran yang dipilih. Muat ulang sesi atau hubungi administrator.');
  }

  const profil = await ambilProfil(user.id);
  const claims = {
    role: user.app_metadata?.role || null,
    roles: Array.isArray(user.app_metadata?.roles) ? user.app_metadata.roles : [],
    tenantId: user.app_metadata?.tenant_id || null,
    isDemo: user.app_metadata?.role === 'demo',
  };
  setState({ ...rakitState(user, claims, profil), sesiMemuat: false });
}

let versiSesi = 0;

export function pantaulogin(onReady, onUbah) {
  const syncUser = async (user) => {
    const saya = ++versiSesi;
    if (!user) {
      setState({ ...STATE_KOSONG });
      onReady?.(null);
      return;
    }

    const profil = await ambilProfil(user.id);
    if (saya !== versiSesi) return;
    const claims = {
      role: user.app_metadata?.role || profil.role || null,
      roles: Array.isArray(user.app_metadata?.roles) ? user.app_metadata.roles : [],
      tenantId: user.app_metadata?.tenant_id || profil.tenant_id || null,
      isDemo: user.app_metadata?.role === 'demo',
    };
    const next = rakitState(user, claims, profil);
    setState({ ...next, sesiMemuat: false });
    onReady?.(user);

    const lama = getState();
    const penting = next.role !== lama.role || next.activeRole !== lama.activeRole || next.tenantId !== lama.tenantId;
    if (penting) onUbah?.();
  };

  const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
    void syncUser(session?.user || null);
  });

  void supabase.auth.getSession().then(({ data, error }) => {
    if (error) {
      console.warn('[auth] sesi Supabase gagal dibaca:', error.message);
      setState({ ...STATE_KOSONG, authReady: true });
      return;
    }
    void syncUser(data.session?.user || null);
  });

  return () => subscription.unsubscribe();
}

export async function updateProfil({ nama, photoURL }) {
  const session = await supabase.auth.getSession();
  const user = session.data.session?.user;
  if (!user) throw new Error('Belum login.');

  const namaBaru = nama ? normalisasiNama(nama) : '';
  const payload = {};
  if (namaBaru) payload.nama = namaBaru;
  if (photoURL) payload.photo_url = photoURL;

  if (Object.keys(payload).length > 0) {
    const { error } = await supabase.from('profiles').upsert({ id: user.id, ...payload }, { onConflict: 'id' });
    if (error) throw error;
  }

  const sekarang = getState().user;
  setState({
    user: {
      ...sekarang,
      displayName: namaBaru || sekarang.displayName,
      photoURL: photoURL || sekarang.photoURL,
    },
    ...(namaBaru ? { profile: { ...getState().profile, nama: namaBaru } } : {}),
  });
}