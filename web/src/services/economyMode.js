export function isEconomyMode() {
  return import.meta.env?.VITE_ECONOMY_MODE?.trim().toLowerCase() === 'true'
    || globalThis.navigator?.connection?.saveData === true;
}

export function intervalForEconomyMode(normalIntervalMs, economyIntervalMs = 180_000) {
  if (!Number.isSafeInteger(normalIntervalMs) || normalIntervalMs < 1 ||
      !Number.isSafeInteger(economyIntervalMs) || economyIntervalMs < normalIntervalMs) {
    throw new TypeError('Interval mode hemat data tidak valid.');
  }
  return isEconomyMode() ? economyIntervalMs : normalIntervalMs;
}
