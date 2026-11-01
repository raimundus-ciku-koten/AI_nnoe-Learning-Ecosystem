import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import SafeMarkdown from './SafeMarkdown.jsx';

describe('SafeMarkdown', () => {
  it('renders formatted text while stripping active HTML and unsafe links', () => {
    const markup = renderToStaticMarkup(
      <SafeMarkdown>
        {'**Aman**\n\n<script>alert(1)</script><img src=x onerror=alert(1)>' +
          '<a href="javascript:alert(1)" onclick="alert(1)">tautan</a>'}
      </SafeMarkdown>,
    );

    expect(markup).toContain('<strong>Aman</strong>');
    expect(markup).toContain('tautan</a>');
    expect(markup).not.toContain('<script');
    expect(markup).not.toContain('<img');
    expect(markup).not.toContain('onerror');
    expect(markup).not.toContain('onclick');
    expect(markup).not.toContain('javascript:');
  });

  it('renders GFM tables without accepting arbitrary attributes', () => {
    const markup = renderToStaticMarkup(
      <SafeMarkdown>{'| Kolom |\n| --- |\n| Isi |\n\n<a href="https://example.com" id="x" class="x">aman</a>'}</SafeMarkdown>,
    );

    expect(markup).toContain('<table>');
    expect(markup).toContain('<td>Isi');
    expect(markup).toContain('aman');
    expect(markup).not.toContain('id="x"');
    expect(markup).not.toContain('class="x"');
  });
});
