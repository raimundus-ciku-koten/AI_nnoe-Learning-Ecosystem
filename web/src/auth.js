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
  isDemo: false, trialExpiresAt: null, claims: null, passwordRecovery: false, sesiMemuat: false,
});

const teks = (v) => (typeof v === 'string' ? v.trim() : '');
const KUNCI_PEMULIHAN_SANDI = 'ale-password-recovery';

function ringkasProfil(profil = {}) {
  return {
    nama: normalisasiNama(profil.nama),
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
    displayName: normalisasiNama(
      ringkas.nama || user.user_metadata?.full_name || user.user_metadata?.nama ||
      user.email?.split('@')[0] || 'Pengguna',
    ),
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
    trialExpiresAt: claims.trialExpiresAt || claims.trial_expires_at || null,
    claims,
    authReady: true,
  };
}

async function ambilProfil(uid) {
  const { data, error } = await supabase
    .from('profiles')
    .select('id,email,nama,role,tenant_id,instansi,active,photo_url')
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

export async function daftarUjiCoba({ nama, email, sandi, captchaToken }) {
  if (!captchaToken) throw new Error('Verifikasi anti-bot wajib diselesaikan untuk mendaftar uji coba.');
  const emailRedirectTo = `${window.location.origin}${window.location.pathname}`;
  const { data, error } = await supabase.auth.signUp({
    email,
    password: sandi,
    options: {
      captchaToken,
      emailRedirectTo,
      data: { full_name: nama },
    },
  });
  if (error) throw error;
  return data;
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
  const redirectTo = new URL(window.location.pathname, window.location.origin);
  redirectTo.searchParams.set('setup-password', '1');
  redirectTo.hash = '/login';
  return supabase.auth.resetPasswordForEmail(email, {
    redirectTo: redirectTo.toString(),
    ...(captchaToken ? { captchaToken } : {}),
  }).then(({ error }) => {
    if (error) throw error;
  });
}

export async function buatKataSandi(password) {
  const { data, error } = await supabase.auth.updateUser({ password });
  if (error) throw error;
  if (!data.user) throw new Error('Supabase Auth tidak mengembalikan identitas akun.');
  window.sessionStorage.removeItem(KUNCI_PEMULIHAN_SANDI);
  setState({ passwordRecovery: false });
  return data.user;
}

export async function masukGoogle(captchaToken) {
  const redirectTo = `${window.location.origin}${window.location.pathname}`;
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

  const profil = user.app_metadata?.role === 'demo' ? {} : await ambilProfil(user.id);
  const claims = {
    role: user.app_metadata?.role || null,
    roles: Array.isArray(user.app_metadata?.roles) ? user.app_metadata.roles : [],
    tenantId: user.app_metadata?.tenant_id || null,
    isDemo: user.app_metadata?.role === 'demo',
    trialExpiresAt: user.app_metadata?.trial_expires_at || null,
  };
  setState({ ...rakitState(user, claims, profil), sesiMemuat: false });
}

let versiSesi = 0;

export function pantaulogin(onReady, onUbah) {
  const isPasswordSetupLink = new URLSearchParams(window.location.search).get('setup-password') === '1';
  if (isPasswordSetupLink || window.sessionStorage.getItem(KUNCI_PEMULIHAN_SANDI) === 'true') {
    setState({ passwordRecovery: true });
  }

  const syncUser = async (user) => {
    const saya = ++versiSesi;
    if (!user) {
      setState({ ...STATE_KOSONG });
      onReady?.(null);
      return;
    }

    const profil = user.app_metadata?.role === 'demo' ? {} : await ambilProfil(user.id);
    if (saya !== versiSesi) return;
    const claims = {
      role: user.app_metadata?.role || profil.role || null,
      roles: Array.isArray(user.app_metadata?.roles) ? user.app_metadata.roles : [],
      tenantId: user.app_metadata?.tenant_id || profil.tenant_id || null,
      isDemo: user.app_metadata?.role === 'demo',
      trialExpiresAt: user.app_metadata?.trial_expires_at || null,
    };
    const next = rakitState(user, claims, profil);
    setState({ ...next, sesiMemuat: false });
    onReady?.(user);

    const lama = getState();
    const penting = next.role !== lama.role || next.activeRole !== lama.activeRole || next.tenantId !== lama.tenantId;
    if (penting) onUbah?.();
  };

  const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
    if (event === 'PASSWORD_RECOVERY' || (event === 'SIGNED_IN' && isPasswordSetupLink)) {
      window.sessionStorage.setItem(KUNCI_PEMULIHAN_SANDI, 'true');
      setState({ passwordRecovery: true });
    } else if (event === 'SIGNED_OUT') {
      window.sessionStorage.removeItem(KUNCI_PEMULIHAN_SANDI);
      setState({ passwordRecovery: false });
    }
    void syncUser(session?.user || null);
  });

  void supabase.auth.getSession().then(({ data, error }) => {
    if (error) {
      console.warn('[auth] sesi Supabase gagal dibaca:', error.message);
      setState({ ...STATE_KOSONG, authReady: true });
      return;
    }
    if (window.sessionStorage.getItem(KUNCI_PEMULIHAN_SANDI) === 'true') {
      setState({ passwordRecovery: true });
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