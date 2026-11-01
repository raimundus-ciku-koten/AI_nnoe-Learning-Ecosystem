export function navigate(path) {
  if (typeof path !== 'string' || !path.trim()) {
    throw new TypeError('Tujuan navigasi harus berupa path yang tidak kosong.');
  }
  const value = path.trim();
  const target = value.startsWith('#')
    ? value
    : `#${value.startsWith('/') ? value : `/${value}`}`;
  if (window.location.hash !== target) window.location.hash = target;
}
