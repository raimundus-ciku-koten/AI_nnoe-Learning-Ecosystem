import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import AssistantArtifacts from './AssistantArtifacts.jsx';

describe('AssistantArtifacts', () => {
  it('renders a validated interactive quiz with keyboard-operable choices', () => {
    const markup = renderToStaticMarkup(<AssistantArtifacts artifacts={[{
      key: '0:0:kuis',
      id: 'kuis',
      type: 'quiz',
      title: 'Latihan',
      complete: true,
      version: 1,
      versionCount: 1,
      content: JSON.stringify({
        title: 'Kuis Fotosintesis',
        questions: [{
          prompt: 'Di mana fotosintesis terutama berlangsung?',
          options: ['Kloroplas', 'Inti sel'],
          answerIndex: 0,
        }],
      }),
    }]} />);

    expect(markup).toContain('aria-label="Panel artifact"');
    expect(markup).toContain('aria-pressed="true"');
    expect(markup).toContain('<fieldset>');
    expect(markup).toContain('Kuis Fotosintesis');
    expect(markup).toContain('type="radio"');
  });

  it('renders HTML only in a scriptless opaque sandbox with a restrictive CSP', () => {
    const markup = renderToStaticMarkup(<AssistantArtifacts artifacts={[{
      key: '0:0:html',
      id: 'html',
      type: 'html',
      title: 'Pratinjau',
      complete: true,
      version: 1,
      versionCount: 1,
      content: '<p>Materi</p><script>parent.document.cookie</script>',
    }]} />);

    expect(markup).toContain('sandbox=""');
    expect(markup).toContain('referrerPolicy="no-referrer"');
    expect(markup).toContain('default-src &#x27;none&#x27;');
    expect(markup).not.toContain('allow-same-origin');
    expect(markup).not.toContain('allow-scripts');
  });

  it('does not render unsupported artifact types', () => {
    const markup = renderToStaticMarkup(<AssistantArtifacts artifacts={[{
      key: '0:0:design',
      id: 'design',
      type: 'unsupported',
      title: 'Desain',
      complete: true,
      version: 1,
      versionCount: 1,
      content: '<script>tidak dijalankan</script>',
    }]} />);

    expect(markup).toContain('belum didukung');
    expect(markup).not.toContain('<script>');
  });
});
