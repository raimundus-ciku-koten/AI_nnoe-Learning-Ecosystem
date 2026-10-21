'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { hasilDariModel, jawabDariModel } = require('../lib/providers');

function jsonResponse(content) {
  return {
    ok: true,
    status: 200,
    json: async () => ({ choices: [{ message: { content } }] })
  };
}

test('uses Groq for structured generation when selected and returns parsed data', async () => {
  let request;
  const result = await hasilDariModel({
    prompt: 'Buat JSON',
    urai: JSON.parse,
    config: {
      geminiKeys: [],
      deepseekKey: '',
      groqKey: 'groq-private-key',
      groqModel: 'llama-3.3-70b-versatile',
      cerebrasKey: 'cerebras-key',
      cerebrasModel: 'qwen-3.8-27b',
      preferredProvider: 'groq'
    },
    fetchFn: async (url, options) => {
      request = { url, options };
      return jsonResponse('{"ok":true}');
    }
  });
  assert.equal(result.penyedia, 'groq');
  assert.deepEqual(result.payload, { ok: true });
  assert.equal(request.url, 'https://api.groq.com/openai/v1/chat/completions');
  assert.equal(request.options.headers.authorization, 'Bearer groq-private-key');
  assert.deepEqual(JSON.parse(request.options.body).response_format, { type: 'json_object' });
});

test('uses Cerebras for assistant chat when selected', async () => {
  let request;
  const result = await jawabDariModel({
    systemPrompt: 'system',
    messages: [{ role: 'user', text: 'hello' }],
    config: {
      geminiKeys: [],
      deepseekKey: '',
      groqKey: '',
      cerebrasKey: 'cerebras-private-key',
      cerebrasModel: 'qwen-3.8-27b',
      preferredProvider: 'cerebras'
    },
    fetchFn: async (url, options) => {
      request = { url, options };
      return jsonResponse('Cerebras answer');
    }
  });
  assert.equal(result.penyedia, 'cerebras');
  assert.equal(result.answer, 'Cerebras answer');
  assert.equal(request.url, 'https://api.cerebras.ai/v1/chat/completions');
  assert.equal(request.options.headers.authorization, 'Bearer cerebras-private-key');
  assert.deepEqual(JSON.parse(request.options.body).messages, [
    { role: 'system', content: 'system' },
    { role: 'user', content: 'hello' }
  ]);
});

test('falls back from the selected provider to another configured provider', async () => {
  const visited = [];
  const result = await hasilDariModel({
    prompt: 'Buat JSON',
    urai: JSON.parse,
    config: {
      geminiKeys: [],
      deepseekKey: 'deepseek-key',
      deepseekModel: 'deepseek-chat',
      groqKey: 'groq-key',
      groqModel: 'llama-3.3-70b-versatile',
      preferredProvider: 'deepseek'
    },
    fetchFn: async (url) => {
      visited.push(url);
      return url.includes('deepseek.com')
        ? { ok: false, status: 503, json: async () => ({}) }
        : jsonResponse('{"fallback":true}');
    }
  });
  assert.deepEqual(visited, [
    'https://api.deepseek.com/chat/completions',
    'https://api.groq.com/openai/v1/chat/completions'
  ]);
  assert.equal(result.penyedia, 'groq');
  assert.deepEqual(result.payload, { fallback: true });
});
