const THINK_OPEN = '<think>';
const THINK_CLOSE = '</think>';

function partialSuffixLength(value, tag) {
  const maximum = Math.min(value.length, tag.length - 1);
  for (let length = maximum; length > 0; length -= 1) {
    if (tag.startsWith(value.slice(-length))) return length;
  }
  return 0;
}

export class ThinkStreamParser {
  constructor() {
    this.buffer = '';
    this.thinking = false;
  }

  push(chunk) {
    if (typeof chunk !== 'string') throw new TypeError('Potongan respons AI harus berupa teks.');
    this.buffer += chunk;
    let visible = '';

    while (this.buffer) {
      const marker = this.thinking ? THINK_CLOSE : THINK_OPEN;
      const markerIndex = this.buffer.indexOf(marker);
      if (markerIndex >= 0) {
        if (!this.thinking) visible += this.buffer.slice(0, markerIndex);
        this.buffer = this.buffer.slice(markerIndex + marker.length);
        this.thinking = !this.thinking;
        continue;
      }

      const preserved = partialSuffixLength(this.buffer, marker);
      const safePrefix = this.buffer.slice(0, this.buffer.length - preserved);
      if (!this.thinking) visible += safePrefix;
      this.buffer = this.buffer.slice(safePrefix.length);
      break;
    }

    return visible;
  }

  flush() {
    const remaining = this.thinking ? '' : this.buffer;
    this.buffer = '';
    return remaining;
  }

  reset() {
    this.buffer = '';
    this.thinking = false;
  }
}

export function removeModelThinking(text) {
  if (typeof text !== 'string') return text;
  const parser = new ThinkStreamParser();
  return parser.push(text) + parser.flush();
}
