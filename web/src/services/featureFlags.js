export function isChatFeatureEnabled(env = import.meta.env) {
  return env?.VITE_CHAT_ENABLED?.trim().toLowerCase() === 'true';
}

export const CHAT_FEATURE_ENABLED = isChatFeatureEnabled();

export function isChatFeaturePath(path) {
  return path === '/chat' ||
    path.startsWith('/chat/') ||
    path === '/admin/dashboard/chat' ||
    path.startsWith('/admin/dashboard/chat/');
}
