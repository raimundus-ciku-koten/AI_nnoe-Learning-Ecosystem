const SELECTOR_FOKUS = [
  'a[href]',
  'button:not([disabled])',
  'input:not([disabled])',
  'select:not([disabled])',
  'textarea:not([disabled])',
  '[tabindex]:not([tabindex="-1"])',
].join(', ');

function elemenFokus(drawer) {
  return Array.from(drawer?.querySelectorAll(SELECTOR_FOKUS) || [])
    .filter((element) => !element.hidden && element.getAttribute('aria-disabled') !== 'true');
}

export function fokusAwalDrawer(drawer) {
  const first = elemenFokus(drawer)[0];
  if (!first) return false;
  first.focus();
  return true;
}

export function tahanFokusDrawer(event, drawer) {
  const focusable = elemenFokus(drawer);
  if (!focusable.length) {
    event.preventDefault();
    drawer?.focus();
    return true;
  }

  const first = focusable[0];
  const last = focusable[focusable.length - 1];
  const targetDiLuar = !drawer.contains(event.target);
  if (event.shiftKey && (event.target === first || targetDiLuar)) {
    event.preventDefault();
    last.focus();
    return true;
  }
  if (!event.shiftKey && (event.target === last || targetDiLuar)) {
    event.preventDefault();
    first.focus();
    return true;
  }
  return false;
}
