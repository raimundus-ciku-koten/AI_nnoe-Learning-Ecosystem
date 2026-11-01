import React, { useState } from 'react';
import SafeMarkdown from './SafeMarkdown.jsx';
import { sanitizeSvgArtifact, validateQuizArtifact } from '../services/assistantArtifacts.js';

const HTML_CSP = "default-src 'none'; base-uri 'none'; connect-src 'none'; form-action 'none'; " +
  "frame-src 'none'; img-src data: blob:; object-src 'none'; script-src 'unsafe-inline'; " +
  "style-src 'unsafe-inline'";

function QuizArtifact({ content }) {
  const [picked, setPicked] = useState({});
  let quiz;
  try {
    quiz = validateQuizArtifact(content);
  } catch (error) {
    return <p role="alert">{error.message} Minta AI_nnoe membuatnya ulang.</p>;
  }
  const answered = Object.keys(picked).length;
  const score = quiz.questions.filter((question, index) =>
    picked[index] === question.answerIndex).length;

  return (
    <div className="ai-artifact-quiz">
      <h3>{quiz.title}</h3>
      {quiz.questions.map((question, questionIndex) => (
        <fieldset key={`${questionIndex}-${question.prompt}`}>
          <legend>{questionIndex + 1}. {question.prompt}</legend>
          {question.options.map((option, optionIndex) => (
            <label key={`${optionIndex}-${option}`}>
              <input
                type="radio"
                name={`artifact-${questionIndex}`}
                checked={picked[questionIndex] === optionIndex}
                disabled={picked[questionIndex] !== undefined}
                onChange={() => setPicked((current) => ({ ...current, [questionIndex]: optionIndex }))}
              />
              {' '}{option}
              {picked[questionIndex] !== undefined && optionIndex === question.answerIndex
                ? ' (benar)' : ''}
            </label>
          ))}
          {picked[questionIndex] !== undefined && question.explanation && (
            <p>{question.explanation}</p>
          )}
        </fieldset>
      ))}
      <p aria-live="polite">Skor: {score} / {quiz.questions.length} ({answered} terjawab)</p>
    </div>
  );
}

function ArtifactContent({ artifact }) {
  if (!artifact.complete) return <p role="status">Artifact sedang dibuat…</p>;
  if (artifact.type === 'markdown') return <SafeMarkdown>{artifact.content}</SafeMarkdown>;
  if (artifact.type === 'code') {
    return <pre><code>{artifact.content}</code></pre>;
  }
  if (artifact.type === 'quiz') return <QuizArtifact content={artifact.content} />;
  if (artifact.type === 'html') {
    const html = `<!doctype html><html lang="id"><head><meta charset="utf-8">` +
      `<meta http-equiv="Content-Security-Policy" content="${HTML_CSP}"></head>` +
      `<body>${artifact.content}</body></html>`;
    return (
      <iframe
        title={artifact.title}
        sandbox=""
        referrerPolicy="no-referrer"
        srcDoc={html}
      />
    );
  }
  if (artifact.type === 'svg') {
    const svg = sanitizeSvgArtifact(artifact.content);
    if (!svg) return <p role="alert">SVG tidak valid atau tidak dapat disanitasi.</p>;
    return <img alt={artifact.title} src={`data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`} />;
  }
  return <p role="status">Jenis artifact ini belum didukung dan tidak ditampilkan.</p>;
}

export default function AssistantArtifacts({ artifacts }) {
  const [activeKey, setActiveKey] = useState('');
  if (!artifacts.length) return null;
  const active = artifacts.find((artifact) => artifact.key === activeKey) || artifacts.at(-1);

  return (
    <section className="ai-artifacts" aria-label="Panel artifact">
      <h3>Artifact percakapan</h3>
      <div className="ai-artifact-tabs" aria-label="Pilih artifact">
        {artifacts.map((artifact, index) => (
          <button
            key={artifact.key}
            type="button"
            aria-pressed={artifact.key === active.key}
            onClick={() => setActiveKey(artifact.key)}
          >
            {artifact.title}{artifact.versionCount > 1 ? ` · v${artifact.version}` : ''}
            {!artifact.complete && ' · dibuat'}
          </button>
        ))}
      </div>
      <div className="ai-artifact-content" aria-live="polite">
        <ArtifactContent artifact={active} />
      </div>
    </section>
  );
}
