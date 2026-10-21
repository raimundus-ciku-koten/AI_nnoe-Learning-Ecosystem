const CONTROL = /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g;
const clean = (value) => String(value).replace(CONTROL, ' ').replace(/[ \t]+/g, ' ').trim();

export class PlanningParseError extends Error {
  constructor(path, message) {
    super(`${path}: ${message}`);
    this.name = 'PlanningParseError';
  }
}

function text(value, path, max, optional = false) {
  if (value === undefined || value === null || value === '') {
    if (optional) return '';
    throw new PlanningParseError(path, 'wajib berupa teks');
  }
  if (typeof value !== 'string') throw new PlanningParseError(path, 'harus teks');
  const output = clean(value);
  if (output.length > max) throw new PlanningParseError(path, `maksimal ${max} karakter`);
  if (!output && !optional) throw new PlanningParseError(path, 'tidak boleh kosong');
  return output;
}

function integer(value, path, min, max) {
  const parsed = typeof value === 'string' && /^\d+$/.test(value.trim()) ? Number(value) : value;
  if (!Number.isInteger(parsed) || parsed < min || parsed > max) {
    throw new PlanningParseError(path, `harus bilangan bulat ${min}-${max}`);
  }
  return parsed;
}

function array(value, path, min, max, parseItem) {
  if (!Array.isArray(value) || value.length < min) throw new PlanningParseError(path, `minimal ${min} butir`);
  if (value.length > max) throw new PlanningParseError(path, `maksimal ${max} butir`);
  return value.map((item, index) => parseItem(item, `${path}[${index}]`));
}

function object(value, path, fields) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new PlanningParseError(path, 'harus objek');
  const expected = Object.keys(fields).sort();
  const received = Object.keys(value).sort();
  if (expected.length !== received.length ||
      expected.some((key, index) => key !== received[index])) {
    throw new PlanningParseError(path, 'struktur memiliki kolom yang tidak dikenal atau belum lengkap');
  }
  return Object.fromEntries(Object.entries(fields).map(([key, parse]) => [key, parse(value[key], `${path}.${key}`)]));
}

function code(value, path) {
  const output = text(value, path, 20);
  if (!/^[A-Za-z0-9][A-Za-z0-9.\-_]{0,19}$/.test(output)) throw new PlanningParseError(path, 'format kode TP tidak valid');
  return output;
}

function parseAtp(value, canonicalCp) {
  const parsed = object(value, 'atp', {
    cp: (input, path) => array(input, path, 1, 30, (item, itemPath) => object(item, itemPath, {
      elemen: (field, fieldPath) => text(field, fieldPath, 120),
      cp: (field, fieldPath) => text(field, fieldPath, 3000)
    })),
    unit: (input, path) => array(input, path, 2, 30, (item, itemPath) => object(item, itemPath, {
      no: (field, fieldPath) => integer(field, fieldPath, 1, 30),
      nama: (field, fieldPath) => text(field, fieldPath, 120),
      elemen: (field, fieldPath) => text(field, fieldPath, 120),
      semester: (field, fieldPath) => {
        const semester = integer(field, fieldPath, 1, 2);
        return semester;
      },
      tp: (goals, goalsPath) => array(goals, goalsPath, 1, 20, (goal, goalPath) => object(goal, goalPath, {
        kode: code,
        rumusan: (field, fieldPath) => text(field, fieldPath, 1200),
        materi: (field, fieldPath) => text(field, fieldPath, 300),
        jp: (field, fieldPath) => integer(field, fieldPath, 1, 99)
      }))
    }))
  });
  const elemenCp = parsed.cp.map((item) => item.elemen.toLocaleLowerCase('id-ID'));
  if (new Set(elemenCp).size !== elemenCp.length) {
    throw new PlanningParseError('atp.cp', 'elemen CP tidak boleh berulang');
  }
  const elemenUnit = parsed.unit.map((unit) => unit.elemen.toLocaleLowerCase('id-ID'));
  if (elemenUnit.some((elemen) => !elemenCp.includes(elemen))) {
    throw new PlanningParseError('atp.unit', 'elemen unit tidak tercantum dalam CP');
  }
  if (elemenCp.some((elemen) => !elemenUnit.includes(elemen))) {
    throw new PlanningParseError('atp.cp', 'setiap elemen CP harus memiliki TP');
  }
  const codes = parsed.unit.flatMap((unit) => unit.tp.map((goal) => goal.kode.toUpperCase().replace(/[^A-Z0-9]/g, '')));
  const unitNumbers = parsed.unit.map((unit) => unit.no);
  if (new Set(codes).size !== codes.length) throw new PlanningParseError('atp', 'kode TP ganda');
  if (new Set(unitNumbers).size !== unitNumbers.length) throw new PlanningParseError('atp.unit', 'nomor unit ganda');
  if (unitNumbers.some((number, index) => number !== index + 1)) {
    throw new PlanningParseError('atp.unit', 'nomor unit harus berurutan');
  }
  if (parsed.unit.some((unit, index) => index > 0 && unit.semester < parsed.unit[index - 1].semester)) {
    throw new PlanningParseError('atp.unit', 'urutan semester tidak boleh mundur');
  }
  if (parsed.unit[0].semester !== 1 || parsed.unit.at(-1).semester !== 2) {
    throw new PlanningParseError('atp.unit', 'urutan ATP harus mencakup Semester 1 dan Semester 2');
  }
  if (canonicalCp) {
    const sameText = (left, right) => clean(left) === clean(right);
    if (!Array.isArray(canonicalCp) ||
        parsed.cp.length !== canonicalCp.length ||
        parsed.cp.some((item, index) =>
          !sameText(item.elemen, canonicalCp[index]?.elemen) ||
          !sameText(item.cp, canonicalCp[index]?.cp))) {
      throw new PlanningParseError('atp.cp', 'rumusan CP harus sama persis dengan sumber terpilih');
    }
  }
  return parsed;
}

function parseKktp(value, validCodes) {
  const parsed = object(value, 'kktp', {
    ambang: (field, path) => integer(field, path, 1, 100),
    items: (input, path) => array(input, path, 1, 80, (item, itemPath) => object(item, itemPath, {
      kode: code,
      indikator: (field, fieldPath) => array(field, fieldPath, 1, 8, (entry, entryPath) => text(entry, entryPath, 400)),
      rubrik: (field, fieldPath) => object(field, fieldPath, {
        perluBimbingan: (entry, entryPath) => text(entry, entryPath, 600),
        cukup: (entry, entryPath) => text(entry, entryPath, 600),
        baik: (entry, entryPath) => text(entry, entryPath, 600),
        sangatBaik: (entry, entryPath) => text(entry, entryPath, 600)
      })
    }))
  });
  const available = new Set(validCodes);
  const included = new Set(parsed.items.map((item) => item.kode.toUpperCase().replace(/[^A-Z0-9]/g, '')));
  if ([...included].some((key) => !available.has(key)) || [...available].some((key) => !included.has(key))) {
    throw new PlanningParseError('kktp', 'kode TP tidak sesuai dengan ATP');
  }
  return parsed;
}

const textList = (maxItems, maxText, allowEmpty = false) => (value, path) =>
  array(value, path, allowEmpty ? 0 : 1, maxItems, (item, itemPath) => text(item, itemPath, maxText));

function parseModule(value, validCodes, allowEmptyLists = false) {
  const parsed = object(value, 'modul', {
    tujuanKode: (input, path) => array(input, path, 1, 20, code),
    model: (field, path) => text(field, path, 160),
    pemahamanBermakna: textList(6, 600, allowEmptyLists),
    pertanyaanPemantik: textList(6, 600, allowEmptyLists),
    dimensiProfil: textList(8, 160, allowEmptyLists),
    sarpras: textList(10, 200, allowEmptyLists),
    pertemuan: (input, path) => array(input, path, 1, 12, (item, itemPath) => object(item, itemPath, {
      ke: (field, fieldPath) => integer(field, fieldPath, 1, 20),
      judul: (field, fieldPath) => text(field, fieldPath, 160),
      tujuan: (field, fieldPath) => text(field, fieldPath, 600),
      menit: (field, fieldPath) => integer(field, fieldPath, 5, 600),
      pendahuluan: textList(8, 600, allowEmptyLists),
      inti: textList(12, 600, allowEmptyLists),
      penutup: textList(8, 600, allowEmptyLists)
    })),
    asesmen: (field, path) => object(field, path, {
      diagnostik: (entry, entryPath) => text(entry, entryPath, 800, allowEmptyLists),
      formatif: (entry, entryPath) => text(entry, entryPath, 800, allowEmptyLists),
      sumatif: (entry, entryPath) => text(entry, entryPath, 800, allowEmptyLists)
    }),
    remedial: (field, path) => text(field, path, 800, allowEmptyLists),
    pengayaan: (field, path) => text(field, path, 800, allowEmptyLists),
    refleksiGuru: textList(6, 600, allowEmptyLists),
    refleksiSiswa: textList(6, 600, allowEmptyLists)
  });
  if (parsed.tujuanKode.some((key) => !validCodes.includes(key.toUpperCase().replace(/[^A-Z0-9]/g, '')))) {
    throw new PlanningParseError('modul', 'kode tujuan tidak sesuai dengan ATP');
  }
  return parsed;
}

export function parsePlanningOutput(type, raw, context = {}) {
  let json;
  try {
    json = JSON.parse(String(raw).replace(/^```(?:json)?\s*|\s*```$/g, ''));
  } catch {
    throw new PlanningParseError(type, 'bukan JSON valid');
  }
  if (type === 'atp') return parseAtp(json, context.cp);
  if (type === 'kktp') return parseKktp(json, context.kodeTp ?? []);
  if (type === 'modul') return parseModule(json, context.kodeTp ?? [], context.allowEmptyLists === true);
  throw new PlanningParseError(type, 'jenis dokumen tidak dikenal');
}
