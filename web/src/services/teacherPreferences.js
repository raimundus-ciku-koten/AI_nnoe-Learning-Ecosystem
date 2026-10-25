const EVENT_PREFERENCES_CHANGED = 'ale:teacher-preferences-changed';
const TEXT_SIZES = new Set(['normal', 'large']);
const MOTION_OPTIONS = new Set(['system', 'reduced']);
const DEFAULT_PREFERENCES = Object.freeze({
  textSize: 'normal',
  motion: 'system',
});

function keyFor(userId, role) {
  if (typeof userId !== 'string' || !userId.trim() ||
      typeof role !== 'string' || !role.trim()) {
    throw new Error('Akun dan peran aktif diperlukan untuk memuat preferensi.');
  }
  return `ale:teacher-preferences:v1:${encodeURIComponent(userId)}:${encodeURIComponent(role)}`;
}

function normalize(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value) ||
      !TEXT_SIZES.has(value.textSize) || !MOTION_OPTIONS.has(value.motion)) {
    return { ...DEFAULT_PREFERENCES };
  }
  return { textSize: value.textSize, motion: value.motion };
}

function validate(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value) ||
      !TEXT_SIZES.has(value.textSize) || !MOTION_OPTIONS.has(value.motion)) {
    throw new TypeError('Nilai preferensi tampilan tidak valid.');
  }
  return { textSize: value.textSize, motion: value.motion };
}

export function bacaPreferensiGuru(userId, role) {
  const key = keyFor(userId, role);
  if (typeof window === 'undefined') return { ...DEFAULT_PREFERENCES };
  const raw = window.localStorage.getItem(key);
  if (!raw) return { ...DEFAULT_PREFERENCES };
  try {
    return normalize(JSON.parse(raw));
  } catch (cause) {
    if (cause instanceof SyntaxError) {
      window.localStorage.removeItem(key);
      return { ...DEFAULT_PREFERENCES };
    }
    throw cause;
  }
}

export function simpanPreferensiGuru(userId, role, preferences) {
  const key = keyFor(userId, role);
  const normalized = validate(preferences);
  if (typeof window === 'undefined') {
    throw new Error('Penyimpanan preferensi hanya tersedia pada browser.');
  }
  window.localStorage.setItem(key, JSON.stringify(normalized));
  window.dispatchEvent(new CustomEvent(EVENT_PREFERENCES_CHANGED, {
    detail: { userId, role, preferences: normalized },
  }));
  return normalized;
}

export function dengarkanPreferensiGuru(callback) {
  if (typeof window === 'undefined') return () => {};
  const onChange = (event) => callback(event.detail);
  window.addEventListener(EVENT_PREFERENCES_CHANGED, onChange);
  return () => window.removeEventListener(EVENT_PREFERENCES_CHANGED, onChange);
}

export function preferensiGuruDefault() {
  return { ...DEFAULT_PREFERENCES };
}
