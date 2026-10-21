'use strict';
/**
 * Provider yang tersedia dicoba sesuai preferensi akun, lalu berdasarkan urutan prioritas.
 * Keluaran divalidasi oleh `urai`; keluaran tidak valid
 * dari satu penyedia dianggap kegagalan penyedia itu (lanjut ke berikutnya).
 * `fetchFn` dapat disuntik agar mudah diuji. Kunci dan prompt TIDAK PERNAH dicatat di log.
 */

const { ParseError } = require('./schema');

const TIMEOUT_MS = 90_000;

class SemuaPenyediaGagal extends Error {
  constructor(rincian) { super('Semua penyedia AI gagal.'); this.name = 'SemuaPenyediaGagal'; this.rincian = rincian; }
}

async function postJson(fetchFn, url, headers, body) {
  const res = await fetchFn(url, {
    method: 'POST',
    headers: { 'content-type': 'application/json', ...headers },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(TIMEOUT_MS)
  });
  if (!res.ok) { const e = new Error(`HTTP ${res.status}`); e.status = res.status; throw e; }
  return res.json();
}

async function panggilGemini(fetchFn, { kunci, model, prompt }) {
  const j = await postJson(fetchFn,
    `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`,
    { 'x-goog-api-key': kunci },
    { contents: [{ role: 'user', parts: [{ text: prompt }] }],
      generationConfig: { responseMimeType: 'application/json', temperature: 0.4, maxOutputTokens: 16384 } });
  const teks = j?.candidates?.[0]?.content?.parts?.map((p) => p.text ?? '').join('');
  if (!teks) throw Object.assign(new Error('Respons kosong'), { status: 502 });
  return teks;
}

async function panggilDeepSeek(fetchFn, { kunci, model, prompt }) {
  const j = await postJson(fetchFn, 'https://api.deepseek.com/chat/completions',
    { authorization: `Bearer ${kunci}` },
    { model, messages: [{ role: 'user', content: prompt }], response_format: { type: 'json_object' }, temperature: 0.4, max_tokens: 8192 });
  const teks = j?.choices?.[0]?.message?.content;
  if (!teks) throw Object.assign(new Error('Respons kosong'), { status: 502 });
  return teks;
}

const OPENAI_COMPATIBLE = {
  groq: { url: 'https://api.groq.com/openai/v1/chat/completions', key: 'groqKey', model: 'groqModel' },
  cerebras: { url: 'https://api.cerebras.ai/v1/chat/completions', key: 'cerebrasKey', model: 'cerebrasModel' }
};
const PROVIDER_ORDER = ['gemini', 'deepseek', 'groq', 'cerebras'];

async function panggilOpenAICompatible(fetchFn, { url, kunci, model, prompt }) {
  const j = await postJson(fetchFn, url, { authorization: `Bearer ${kunci}` }, {
    model,
    messages: [{ role: 'user', content: prompt }],
    response_format: { type: 'json_object' },
    temperature: 0.4,
    max_tokens: 8192
  });
  const teks = j?.choices?.[0]?.message?.content;
  if (!teks) throw Object.assign(new Error('Respons kosong'), { status: 502 });
  return teks;
}

async function panggilOpenAICompatibleAsisten(fetchFn, { url, kunci, model, systemPrompt, messages }) {
  const j = await postJson(fetchFn, url, { authorization: `Bearer ${kunci}` }, {
    model,
    messages: [
      { role: 'system', content: systemPrompt },
      ...messages.map((message) => ({ role: message.role, content: message.text }))
    ],
    temperature: 0.6,
    max_tokens: 2048
  });
  const teks = j?.choices?.[0]?.message?.content?.trim();
  if (!teks) throw Object.assign(new Error('Respons kosong'), { status: 502 });
  return teks;
}

function kunciPenyedia(config, provider) {
  if (provider === 'gemini') return config.geminiKeys?.filter(Boolean) ?? [];
  const key = config[`${provider}Key`];
  return key ? [key] : [];
}

function urutanPenyedia(config) {
  const preferred = PROVIDER_ORDER.includes(config.preferredProvider) ? config.preferredProvider : '';
  return preferred
    ? [preferred, ...PROVIDER_ORDER.filter((provider) => provider !== preferred)]
    : PROVIDER_ORDER;
}

function adaPenyediaAktif(config) {
  return PROVIDER_ORDER.some((provider) => kunciPenyedia(config, provider).length > 0);
}

async function panggilPenyedia(fetchFn, config, provider, key, input) {
  if (provider === 'gemini') {
    if (input.messages) return panggilGeminiAsisten(fetchFn, {
      kunci: key, model: config.geminiModel, ...input
    });
    return panggilGemini(fetchFn, { kunci: key, model: config.geminiModel, ...input });
  }
  if (provider === 'deepseek') {
    if (input.messages) return panggilDeepSeekAsisten(fetchFn, {
      kunci: key, model: config.deepseekModel, ...input
    });
    return panggilDeepSeek(fetchFn, { kunci: key, model: config.deepseekModel, ...input });
  }
  const adapter = OPENAI_COMPATIBLE[provider];
  if (input.messages) return panggilOpenAICompatibleAsisten(fetchFn, {
    ...adapter, kunci: key, model: config[adapter.model], ...input
  });
  return panggilOpenAICompatible(fetchFn, {
    ...adapter, kunci: key, model: config[adapter.model], ...input
  });
}

async function panggilClaude(fetchFn, { kunci, model, prompt }) {
  const j = await postJson(fetchFn, 'https://api.anthropic.com/v1/messages',
    { 'x-api-key': kunci, 'anthropic-version': '2023-06-01' },
    { model, max_tokens: 8192, temperature: 0.4, messages: [{ role: 'user', content: prompt }] });
  const teks = j?.content?.filter((bagian) => bagian.type === 'text').map((bagian) => bagian.text).join('');
  if (!teks) throw Object.assign(new Error('Respons kosong'), { status: 502 });
  return teks;
}

async function panggilGeminiAsisten(fetchFn, { kunci, model, systemPrompt, messages }) {
  const j = await postJson(fetchFn,
    `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`,
    { 'x-goog-api-key': kunci },
    {
      systemInstruction: { parts: [{ text: systemPrompt }] },
      contents: messages.map((m) => ({
        role: m.role === 'assistant' ? 'model' : 'user',
        parts: [{ text: m.text }]
      })),
      generationConfig: { temperature: 0.6, maxOutputTokens: 2048 }
    });
  const teks = j?.candidates?.[0]?.content?.parts?.map((p) => p.text ?? '').join('').trim();
  if (!teks) throw Object.assign(new Error('Respons kosong'), { status: 502 });
  return teks;
}

async function panggilDeepSeekAsisten(fetchFn, { kunci, model, systemPrompt, messages }) {
  const j = await postJson(fetchFn, 'https://api.deepseek.com/chat/completions',
    { authorization: `Bearer ${kunci}` },
    {
      model,
      messages: [
        { role: 'system', content: systemPrompt },
        ...messages.map((m) => ({ role: m.role, content: m.text }))
      ],
      temperature: 0.6,
      max_tokens: 2048
    });
  const teks = j?.choices?.[0]?.message?.content?.trim();
  if (!teks) throw Object.assign(new Error('Respons kosong'), { status: 502 });
  return teks;
}

async function jawabDariModel({ systemPrompt, messages, config, fetchFn = fetch, log = () => {} }) {
  const rincian = [];
  for (const provider of urutanPenyedia(config)) {
    const keys = kunciPenyedia(config, provider);
    for (let index = 0; index < keys.length; index++) {
      try {
        const answer = await panggilPenyedia(fetchFn, config, provider, keys[index], { systemPrompt, messages });
        return { answer, penyedia: provider, model: config[`${provider}Model`] };
      } catch (error) {
        const reason = `status_${error.status ?? 'jaringan'}`;
        rincian.push(`${provider}${keys.length > 1 ? `#${index + 1}` : ''}:${reason}`);
        log(`${provider} gagal (${reason})`);
      }
    }
  }

  throw new SemuaPenyediaGagal(rincian);
}

/**
 * @param {Object} p
 * @param {string} p.prompt
 * @param {(teks:string)=>any} p.urai  melempar ParseError bila tidak valid
 * @param {Object} p.config Provider keys/models plus an optional preferredProvider.
 * @param {typeof fetch} [p.fetchFn]
 * @param {(msg:string)=>void} [p.log]
 */
async function hasilDariModel({ prompt, urai, config, fetchFn = fetch, log = () => {} }) {
  const rincian = [];

  for (const provider of urutanPenyedia(config)) {
    const keys = kunciPenyedia(config, provider);
    for (let index = 0; index < keys.length; index++) {
      try {
        const teks = await panggilPenyedia(fetchFn, config, provider, keys[index], { prompt });
        return { payload: urai(teks), penyedia: provider, model: config[`${provider}Model`] };
      } catch (error) {
        const reason = error instanceof ParseError ? 'keluaran_tidak_valid' : `status_${error.status ?? 'jaringan'}`;
        rincian.push(`${provider}${keys.length > 1 ? `#${index + 1}` : ''}:${reason}`);
        log(`${provider} gagal (${reason})`);
        if (error instanceof ParseError) break;
      }
    }
  }

  if (config.anthropicKey) {
    try {
      const teks = await panggilClaude(fetchFn, {
        kunci: config.anthropicKey, model: config.anthropicModel, prompt
      });
      return { payload: urai(teks), penyedia: 'claude', model: config.anthropicModel };
    } catch (e) {
      const alasan = e instanceof ParseError ? 'keluaran_tidak_valid' : `status_${e.status ?? 'jaringan'}`;
      rincian.push(`claude:${alasan}`);
      log(`claude gagal (${alasan})`);
    }
  }
  throw new SemuaPenyediaGagal(rincian);
}

module.exports = { hasilDariModel, jawabDariModel, adaPenyediaAktif, SemuaPenyediaGagal };
