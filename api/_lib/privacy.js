const PERSONAL_DATA_PATTERNS = [
  /\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/i,
  /\b(?:\+?62|0)8[1-9][0-9]{6,11}\b/,
  /\b(?:NIK|NISN|NIP)\s*[:=]?\s*\d{10,18}\b/i,
  /\b\d{16,18}\b/,
];

function containsLikelyPersonalData(value) {
  const text = String(value || '');
  return PERSONAL_DATA_PATTERNS.some((pattern) => pattern.test(text));
}

module.exports = { containsLikelyPersonalData };
