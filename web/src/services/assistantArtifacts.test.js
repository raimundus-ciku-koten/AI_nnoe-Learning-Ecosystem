import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  extractAssistantArtifacts,
  sanitizeSvgArtifact,
  validateQuizArtifact,
} from './assistantArtifacts.js';

function buatNode(localName, attributes = [], children = [], parent = null) {
  const node = {
    localName,
    attributes: attributes.map(([name, value]) => ({ name, value })),
    children,
    parent,
    remove() {
      if (this.parent) this.parent.children.splice(this.parent.children.indexOf(this), 1);
    },
    removeAttribute(name) {
      this.attributes = this.attributes.filter((attribute) => attribute.name !== name);
    },
    setAttribute(name, value) {
      this.removeAttribute(name);
      this.attributes.push({ name, value });
    },
  };
  children.forEach((child) => { child.parent = node; });
  return node;
}

afterEach(() => vi.unstubAllGlobals());

describe('assistant artifacts', () => {
  it('extracts complete artifacts without exposing their body in the chat text', () => {
    const result = extractAssistantArtifacts(
      'Berikut latihan.\n<artifact id="latihan-1" type="quiz" title="Kuis singkat">{"title":"Kuis"}</artifact>\nSilakan mulai.',
    );

    expect(result.visible).toContain('Berikut latihan.');
    expect(result.visible).toContain('[Artifact: Kuis singkat]');
    expect(result.visible).toContain('Silakan mulai.');
    expect(result.visible).not.toContain('{"title":"Kuis"}');
    expect(result.artifacts).toEqual([{
      id: 'latihan-1',
      type: 'quiz',
      title: 'Kuis singkat',
      content: '{"title":"Kuis"}',
      complete: true,
    }]);
  });

  it('marks a partial artifact as incomplete and removes an unfinished opening tag', () => {
    const partial = extractAssistantArtifacts(
      'Sedang menyiapkan kuis.\n<artifact id="kuis-1" type="quiz" title="Kuis">{"title":',
    );
    const partialOpening = extractAssistantArtifacts('Penjelasan <artifact id="ku');

    expect(partial.visible).toContain('[Artifact: Kuis]');
    expect(partial.artifacts[0]).toMatchObject({ complete: false });
    expect(partialOpening.visible).toBe('Penjelasan');
    expect(partialOpening.artifacts).toEqual([]);
  });

  it('keeps repeated artifact IDs as separate in-memory versions', () => {
    const result = extractAssistantArtifacts(
      '<artifact id="ringkasan" type="markdown" title="Ringkasan">Versi satu</artifact>' +
      '<artifact id="ringkasan" type="markdown" title="Ringkasan">Versi dua</artifact>',
    );

    expect(result.artifacts.map((artifact) => artifact.content)).toEqual(['Versi satu', 'Versi dua']);
  });

  it('validates quiz bounds and answer indexes before rendering', () => {
    const quiz = validateQuizArtifact(JSON.stringify({
      title: 'Kuis Fotosintesis',
      questions: [{
        prompt: 'Di mana fotosintesis terutama berlangsung?',
        options: ['Kloroplas', 'Inti sel'],
        answerIndex: 0,
        explanation: 'Kloroplas mengandung klorofil.',
      }],
    }));

    expect(quiz.questions[0].answerIndex).toBe(0);
    expect(() => validateQuizArtifact(JSON.stringify({
      title: 'Kuis',
      questions: [{ prompt: 'Pilih.', options: ['A', 'B'], answerIndex: 2 }],
    }))).toThrow('nomor 1 tidak valid');
    expect(() => validateQuizArtifact('bukan JSON')).toThrow('JSON yang valid');
  });

  it('removes active SVG nodes, event handlers, and external paint references', () => {
    const root = buatNode('svg', [
      ['viewBox', '0 0 20 20'],
      ['onload', 'alert(1)'],
      ['fill', 'url(https://example.test/paint.svg#paint)'],
    ], [
      buatNode('path', [['d', 'M0 0 L10 10'], ['stroke', '#123456']]),
      buatNode('script'),
      buatNode('foreignObject'),
    ]);
    vi.stubGlobal('DOMParser', class {
      parseFromString() {
        return { documentElement: root, querySelector: () => null };
      }
    });
    vi.stubGlobal('XMLSerializer', class {
      serializeToString(node) {
        const attrs = node.attributes.map(({ name, value }) => `${name}="${value}"`).join(' ');
        return `<${node.localName} ${attrs}>${node.children.map((child) =>
          this.serializeToString(child)).join('')}</${node.localName}>`;
      }
    });

    const sanitized = sanitizeSvgArtifact('<svg/>');

    expect(sanitized).toContain('viewBox="0 0 20 20"');
    expect(sanitized).toContain('stroke="#123456"');
    expect(sanitized).toContain('xmlns="http://www.w3.org/2000/svg"');
    expect(sanitized).not.toContain('onload');
    expect(sanitized).not.toContain('url(');
    expect(sanitized).not.toContain('<script');
    expect(sanitized).not.toContain('foreignObject');
  });
});
