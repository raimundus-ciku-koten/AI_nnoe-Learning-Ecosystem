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

export default function MathEquationInput({
  value, onChange, maxLength = 1000, label = 'Persamaan',
  textLabel = 'Jawaban teks', readOnly = false,
}) {
  const mathFieldRef = useRef(null);
  const onChangeRef = useRef(onChange);
  const [ready, setReady] = useState(false);
  const [editorError, setEditorError] = useState('');
  const parsed = parseValue(value);

  onChangeRef.current = onChange;

  useEffect(() => {
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
      setReady(true);
    }).catch(() => {
      if (active) setEditorError('Editor persamaan belum dapat dimuat.');
    });

    return () => {
      active = false;
      field?.removeEventListener('input', handleInput);
    };
  }, [maxLength, readOnly]);

  const valueRef = useRef(value);
  valueRef.current = value;

  useEffect(() => {
    if (!ready || !mathFieldRef.current) return;
    mathFieldRef.current.readOnly = readOnly;
    const equation = parseValue(value).equation;
    if (mathFieldRef.current.value !== equation) mathFieldRef.current.value = equation;
  }, [ready, value, readOnly]);

  function showKeyboard() {
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
        <button type="button" className="math-equation-keyboard" onClick={showKeyboard} disabled={!ready || readOnly}>
          Buka simbol &amp; equation
        </button>
      </div>
      {React.createElement('math-field', {
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