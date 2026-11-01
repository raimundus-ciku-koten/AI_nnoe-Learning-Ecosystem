const TYPES = new Set(['markdown', 'html', 'svg', 'quiz', 'design', 'code']);
const OPEN_ARTIFACT = /<artifact\s+([^>]*)>/g;
const CLOSE_ARTIFACT = '</artifact>';

function parseAttributes(value) {
  return Object.fromEntries([...value.matchAll(/([a-z]+)="([^"]*)"/g)]
    .map((match) => [match[1], match[2]]));
}

function validArtifactId(value) {
  return typeof value === 'string' && /^[a-z0-9-]{1,64}$/.test(value);
}

export function extractAssistantArtifacts(raw) {
  const text = String(raw ?? '');
  const artifacts = [];
  let visible = '';
  let cursor = 0;
  OPEN_ARTIFACT.lastIndex = 0;
  let match;

  while ((match = OPEN_ARTIFACT.exec(text)) !== null) {
    visible += text.slice(cursor, match.index);
    const attributes = parseAttributes(match[1]);
    const bodyStart = OPEN_ARTIFACT.lastIndex;
    const end = text.indexOf(CLOSE_ARTIFACT, bodyStart);
    const id = validArtifactId(attributes.id) ? attributes.id : `artifact-${artifacts.length + 1}`;
    const type = TYPES.has(attributes.type) ? attributes.type : 'unsupported';
    const title = (attributes.title || 'Tanpa judul').slice(0, 160);
    artifacts.push({
      id,
      type,
      title,
      content: text.slice(bodyStart, end < 0 ? text.length : end).trim(),
      complete: end >= 0,
    });
    visible += `\n\n[Artifact: ${title}]\n\n`;
    cursor = end < 0 ? text.length : end + CLOSE_ARTIFACT.length;
    OPEN_ARTIFACT.lastIndex = cursor;
    if (end < 0) break;
  }

  visible += text.slice(cursor);
  visible = visible.replace(/<artifact(?:\s+[^>]*)?$/, '').trim();
  return { visible, artifacts };
}

export function validateQuizArtifact(raw) {
  let quiz;
  try {
    quiz = JSON.parse(raw);
  } catch {
    throw new Error('Kuis artifact tidak berisi JSON yang valid.');
  }
  if (!quiz || typeof quiz !== 'object' || Array.isArray(quiz) ||
      typeof quiz.title !== 'string' || quiz.title.length > 160 ||
      !Array.isArray(quiz.questions) || quiz.questions.length < 1 || quiz.questions.length > 20) {
    throw new Error('Struktur kuis artifact tidak valid.');
  }
  for (const [index, question] of quiz.questions.entries()) {
    if (!question || typeof question.prompt !== 'string' || !question.prompt.trim() ||
        question.prompt.length > 500 || !Array.isArray(question.options) ||
        question.options.length < 2 || question.options.length > 5 ||
        question.options.some((option) =>
          typeof option !== 'string' || !option.trim() || option.length > 200) ||
        !Number.isInteger(question.answerIndex) || question.answerIndex < 0 ||
        question.answerIndex >= question.options.length ||
        (question.explanation !== undefined &&
          (typeof question.explanation !== 'string' || question.explanation.length > 600))) {
      throw new Error(`Struktur soal kuis artifact nomor ${index + 1} tidak valid.`);
    }
  }
  return quiz;
}

const SVG_TAGS = new Set([
  'svg', 'g', 'path', 'circle', 'ellipse', 'rect', 'line', 'polyline', 'polygon', 'title', 'desc',
]);
const SVG_ATTRIBUTES = new Set([
  'xmlns', 'viewBox', 'width', 'height', 'x', 'y', 'x1', 'x2', 'y1', 'y2',
  'cx', 'cy', 'r', 'rx', 'ry', 'd', 'points', 'fill', 'stroke', 'stroke-width',
  'stroke-linecap', 'stroke-linejoin', 'opacity',
]);
const SVG_COLOR = /^(?:#[\da-f]{3,8}|none|currentColor|black|white|transparent)$/i;
const SVG_NUMBER = /^-?(?:\d+\.?\d*|\.\d+)(?:[\s,]+-?(?:\d+\.?\d*|\.\d+))*$/;

export function sanitizeSvgArtifact(raw) {
  if (typeof globalThis.DOMParser !== 'function' ||
      typeof globalThis.XMLSerializer !== 'function' ||
      typeof raw !== 'string' || raw.length > 100_000) {
    return '';
  }
  const document = new DOMParser().parseFromString(raw, 'image/svg+xml');
  const root = document.documentElement;
  if (root?.localName !== 'svg' || document.querySelector('parsererror')) return '';

  const sanitizeNode = (node) => {
    for (const child of [...node.children]) {
      if (!SVG_TAGS.has(child.localName)) {
        child.remove();
        continue;
      }
      sanitizeNode(child);
    }
    for (const attribute of [...node.attributes]) {
      const { name, value } = attribute;
      const safe = SVG_ATTRIBUTES.has(name) &&
        (name === 'xmlns'
          ? value === 'http://www.w3.org/2000/svg'
          : ['fill', 'stroke'].includes(name)
            ? SVG_COLOR.test(value)
            : name === 'stroke-linecap'
              ? ['butt', 'round', 'square'].includes(value)
              : name === 'stroke-linejoin'
                ? ['miter', 'round', 'bevel'].includes(value)
            : ['d', 'points'].includes(name)
              ? /^[\da-zA-Z.,\s+\-]*$/.test(value)
              : SVG_NUMBER.test(value));
      if (!safe) node.removeAttribute(name);
    }
  };
  sanitizeNode(root);
  root.setAttribute('xmlns', 'http://www.w3.org/2000/svg');
  return new XMLSerializer().serializeToString(root);
}
