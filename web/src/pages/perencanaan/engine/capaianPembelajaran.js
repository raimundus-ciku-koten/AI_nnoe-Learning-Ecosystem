const CONTROL = /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g;
const MAX_TEXT_LENGTH = 3000;
const MAX_CP_ITEMS = 30;

const clean = (value) => String(value ?? '')
  .replace(CONTROL, ' ')
  .replace(/[ \t]+/g, ' ')
  .replace(/\s*\n\s*/g, '\n')
  .trim();

const escapeRegex = (value) => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const wordsPattern = (value) => value.trim().split(/\s+/).map(escapeRegex).join('\\s+');

function headingPattern(mapel) {
  const normalized = String(mapel ?? '').trim();
  if (!normalized || normalized.length > 120) throw new TypeError('Nama mata pelajaran tidak valid.');
  const name = wordsPattern(normalized);
  return new RegExp(
    `CAPAIAN\\s+PEMBELAJARAN(?:\\s+MATA\\s+PELAJARAN)?\\s+${name}(?![\\p{L}\\p{N}])`,
    'giu',
  );
}

function temukanBagianMapel(teks, mapel, fileName) {
  const headings = [...teks.matchAll(headingPattern(mapel))];
  if (headings.length) {
    return headings.map((heading, index) => ({
      awal: heading.index,
      akhir: headings[index + 1]?.index ?? teks.length,
    }));
  }

  const basename = String(fileName ?? '').replace(/\.pdf$/i, '').trim();
  const namaFile = basename.toLocaleLowerCase('id-ID').replace(/[^\p{L}\p{N}]+/gu, ' ').trim();
  const namaMapel = String(mapel).toLocaleLowerCase('id-ID')
    .replace(/[^\p{L}\p{N}]+/gu, ' ').trim();
  if (namaFile === namaMapel) {
    const phaseHeader = /Fase\s+[A-F]\s*\(\s*Umumnya\b/iu.exec(teks);
    if (phaseHeader) return [{ awal: 0, akhir: teks.length }];
  }
  throw new Error(`Bagian CP untuk mata pelajaran "${mapel}" tidak ditemukan di ${fileName || 'PDF sumber'}.`);
}

function phasePattern() {
  return /Fase\s+([A-F])\s*\(\s*Umumnya\b[\s\S]{0,240}?\)/giu;
}

function splitLongText(value, maxLength = MAX_TEXT_LENGTH) {
  const chunks = [];
  let remaining = clean(value);
  while (remaining.length > maxLength) {
    let boundary = remaining.lastIndexOf(' ', maxLength);
    if (boundary < maxLength * 0.6) boundary = maxLength;
    chunks.push(remaining.slice(0, boundary).trim());
    remaining = remaining.slice(boundary).trim();
  }
  if (remaining) chunks.push(remaining);
  return chunks;
}

function elemenDariFase(text, fase) {
  const lines = text.split('\n').map((line) => line.trim()).filter((line) =>
    line && !/^page\s+\d+\s+of\s+\d+$/i.test(line));
  const heading = /^(?:\d+(?:\.\d+)*\.?)\s+(.{2,120})$/u;
  const markers = [];
  lines.forEach((line, index) => {
    const match = heading.exec(line);
    if (match) markers.push({ index, label: match[1].trim() });
  });

  const parts = markers.length
    ? markers.map((marker, index) => ({
      elemen: marker.label,
      cp: lines.slice(marker.index + 1, markers[index + 1]?.index ?? lines.length).join(' '),
    }))
    : [{ elemen: `Capaian Pembelajaran Fase ${fase}`, cp: lines.join(' ') }];

  const result = [];
  for (const part of parts) {
    const values = splitLongText(part.cp);
    values.forEach((cp, index) => {
      if (!cp) return;
      result.push({
        elemen: values.length > 1 ? `${part.elemen} (bagian ${index + 1})` : part.elemen,
        cp,
      });
    });
  }
  if (!result.length) throw new Error(`Isi CP Fase ${fase} tidak ditemukan atau kosong.`);
  if (result.length > MAX_CP_ITEMS) {
    throw new Error(`CP Fase ${fase} berisi lebih dari ${MAX_CP_ITEMS} elemen; tinjau PDF sumber sebelum mengimpor.`);
  }
  return result;
}

export function parseCapaianPembelajaranText({
  text: rawText,
  mapel,
  fase,
  fileName,
  sourceFileId = '',
}) {
  if (!['A', 'B', 'C', 'D', 'E', 'F'].includes(fase)) {
    throw new TypeError('Fase CP harus A sampai F.');
  }
  if (typeof rawText !== 'string' || rawText.length > 250_000) {
    throw new TypeError('Teks PDF CP kosong atau melebihi batas aman 250.000 karakter.');
  }
  const text = clean(rawText);
  const sections = temukanBagianMapel(text, mapel, fileName);
  for (const section of sections) {
    const source = text.slice(section.awal, section.akhir);
    const headers = [...source.matchAll(phasePattern())];
    const selected = headers.find((header) => header[1].toUpperCase() === fase);
    if (!selected) continue;
    const nextHeader = headers.find((header) => header.index > selected.index);
    const end = nextHeader?.index ?? source.length;
    const rest = source.slice(selected.index + selected[0].length, end);
    const outcome = new RegExp(`Pada\\s+akhir\\s+Fase\\s+${fase}\\b[\\s\\S]{0,240}?berikut\\s*[:.]?`, 'iu').exec(rest);
    const body = outcome ? rest.slice(outcome.index + outcome[0].length) : rest;
    const cp = elemenDariFase(body, fase);
    return {
      mapel: String(mapel).trim(),
      fase,
      cp,
      source: {
        fileName: String(fileName ?? '').trim(),
        fileId: sourceFileId,
        importedAt: new Date().toISOString(),
      },
    };
  }
  throw new Error(`CP untuk "${mapel}" Fase ${fase} tidak ditemukan di ${fileName || 'PDF sumber'}.`);
}
