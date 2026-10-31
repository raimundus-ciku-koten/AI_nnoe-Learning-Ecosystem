import React, { useEffect, useRef, useState } from 'react';
import 'mathlive/fonts.css';
import '../styles/math-equation.css';

const EQUATION_MARKER = '\n\n[Persamaan]\n';

function parseValue(value) {
    const raw = String(value || '');
    const markerIndex = raw.lastIndexOf(EQUATION_MARKER);
    if (markerIndex < 0) return { text: raw, equation: '' };
    return {
        text: raw.slice(0, markerIndex),
        equation: raw.slice(markerIndex + EQUATION_MARKER.length),
    };
}

function combineValue(text, equation) {
    return equation ? `${text}${EQUATION_MARKER}${equation}` : text;
}

export function MathEquationDisplay({ value }) {
    const parsed = parseValue(value);
    const fieldRef = useRef(null);
    const [ready, setReady] = useState(false);

    useEffect(() => {
        let active = true;
        import('mathlive').then(() => {
            if (!active || !fieldRef.current) return;
            fieldRef.current.readOnly = true;
            fieldRef.current.mathVirtualKeyboardPolicy = 'manual';
            fieldRef.current.value = parsed.equation;
            setReady(true);
        }).catch(() => { });
        return () => { active = false; };
    }, [parsed.equation]);

    if (!parsed.equation) return parsed.text;
    return (
        <span className="math-equation-display">
            {parsed.text && <span>{parsed.text}</span>}
            {React.createElement('math-field', {
                ref: fieldRef,
                className: 'math-equation-field math-equation-readonly',
                'aria-label': 'Persamaan matematika',
                'math-virtual-keyboard-policy': 'manual',
                'read-only': ready ? '' : undefined,
            })}
        </span>
    );
}

export default function MathEquationInput({
    value, onChange, maxLength = 1000, label = 'Persamaan',
    textLabel = 'Jawaban teks', readOnly = false,
}) {
    const mathFieldRef = useRef(null);
    const onChangeRef = useRef(onChange);
    const [ready, setReady] = useState(false);
    const [editorRequested, setEditorRequested] = useState(false);
    const [editorError, setEditorError] = useState('');
    const parsed = parseValue(value);

    onChangeRef.current = onChange;

    useEffect(() => {
        if (!editorRequested) return undefined;
        let active = true;
        let field;
        const handleInput = () => {
            const current = parseValue(valueRef.current);
            const equation = field?.value || '';
            const next = combineValue(current.text, equation);
            if (next.length <= maxLength) onChangeRef.current(next);
            else {
                field.value = current.equation;
                setEditorError(`Jawaban maksimal ${maxLength} karakter.`);
            }
        };

        import('mathlive').then(() => {
            if (!active || !mathFieldRef.current) return;
            field = mathFieldRef.current;
            field.mathVirtualKeyboardPolicy = 'manual';
            field.readOnly = readOnly;
            field.value = parseValue(valueRef.current).equation;
            field.addEventListener('input', handleInput);
            setEditorError('');
            setReady(true);
        }).catch(() => {
            if (active) {
                setEditorError('Editor persamaan belum dapat dimuat. Coba lagi.');
                setEditorRequested(false);
            }
        });

        return () => {
            active = false;
            field?.removeEventListener('input', handleInput);
        };
    }, [editorRequested, maxLength, readOnly]);

    const valueRef = useRef(value);
    valueRef.current = value;

    useEffect(() => {
        if (!ready || !mathFieldRef.current) return;
        mathFieldRef.current.readOnly = readOnly;
        const equation = parseValue(value).equation;
        if (mathFieldRef.current.value !== equation) mathFieldRef.current.value = equation;
    }, [ready, value, readOnly]);

    function showKeyboard() {
        if (!editorRequested) {
            setEditorRequested(true);
            return;
        }
        if (!ready) return;
        globalThis.mathVirtualKeyboard?.show();
        globalThis.window?.mathVirtualKeyboard?.show();
        mathFieldRef.current?.focus();
    }

    function changeText(text) {
        const next = combineValue(text, parsed.equation);
        if (next.length > maxLength) {
            setEditorError(`Jawaban maksimal ${maxLength} karakter.`);
            return;
        }
        setEditorError('');
        onChange(next);
    }

    return (
        <div className="math-equation-input">
            <label className="math-equation-text-label">
                {textLabel}
                <textarea
                    rows="4"
                    maxLength={maxLength}
                    readOnly={readOnly}
                    value={parsed.text}
                    onChange={(event) => changeText(event.target.value)}
                />
            </label>
            <div className="math-equation-toolbar">
                <span>{label}</span>
                <button type="button" className="math-equation-keyboard" onClick={showKeyboard}
                    disabled={readOnly || (editorRequested && !ready)}>
                    {ready ? 'Buka simbol & equation'
                        : editorRequested ? 'Memuat editor…'
                            : editorError ? 'Coba lagi memuat editor' : 'Aktifkan editor persamaan'}
                </button>
            </div>
            {editorRequested && React.createElement('math-field', {
                ref: mathFieldRef,
                className: 'math-equation-field',
                'aria-label': label,
                'math-virtual-keyboard-policy': 'manual',
            })}
            {editorError && <p className="ale-exam-error" role="alert">{editorError}</p>}
            <p className="math-equation-hint">Persamaan disimpan sebagai LaTeX bersama jawaban, bukan sebagai gambar.</p>
        </div>
    );
}