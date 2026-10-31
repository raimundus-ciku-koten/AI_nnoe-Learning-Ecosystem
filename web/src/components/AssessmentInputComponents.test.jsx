import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import MathEquationInput, { MathEquationDisplay } from './MathEquationInput.jsx';
import PdfQuestionDraftPanel from './PdfQuestionDraftPanel.jsx';

describe('assessment input components', () => {
    it('renders equation input and displays stored LaTeX separately from answer text', () => {
        const input = renderToStaticMarkup(<MathEquationInput value="Jelaskan" onChange={vi.fn()} />);
        const display = renderToStaticMarkup(<MathEquationDisplay value={'Hasil: \n\n[Persamaan]\n\\frac{1}{2}'} />);
        expect(input).toContain('Aktifkan editor persamaan');
        expect(input).not.toContain('math-field');
        expect(input).toContain('Jawaban teks');
        expect(display).toContain('Hasil:');
        expect(display).toContain('math-field');
        expect(display).not.toContain('[Persamaan]');
    });

    it('requires explicit consent before sending extracted PDF text to AI', () => {
        const html = renderToStaticMarkup(
            <PdfQuestionDraftPanel userId="teacher-1" classes={['X']} onDrafts={vi.fn()} />,
        );
        expect(html).toContain('application/pdf');
        expect(html).toContain('PDF dibaca di perangkat');
        expect(html).toContain('Saya setuju mengirim cuplikan teks PDF');
        expect(html).toContain('disabled=""');
    });
});
