const TRUSTED_AVATAR_HOSTS = ['.googleusercontent.com', '.supabase.co'];

export function urlFotoAman(value) {
  if (typeof value !== 'string' || !value.trim()) return false;
  try {
    const url = new URL(value);
    return url.protocol === 'https:' &&
      TRUSTED_AVATAR_HOSTS.some((suffix) => url.hostname.toLowerCase().endsWith(suffix));
  } catch {
    return false;
  }
}
