export function isChatFeatureEnabled(env = import.meta.env) {
  return env?.VITE_CHAT_ENABLED?.trim().toLowerCase() === 'true';
}

export function isChatCallsEnabled(env = import.meta.env) {
  return isChatFeatureEnabled(env) &&
    env?.VITE_CHAT_CALLS_ENABLED?.trim().toLowerCase() === 'true';
}

export const CHAT_FEATURE_ENABLED = isChatFeatureEnabled();
export const CHAT_CALLS_ENABLED = isChatCallsEnabled();
export const CHAT_UNAVAILABLE_MESSAGE =
  'Chat belum tersedia karena skema database dan kebijakan akses sekolah belum terverifikasi. Fitur akan dibuka setelah pemeriksaan keamanan dan uji fungsi selesai.';

export function isChatFeaturePath(path) {
  return path === '/chat' ||
    path.startsWith('/chat/') ||
    path === '/admin/dashboard/chat' ||
    path.startsWith('/admin/dashboard/chat/');
}
