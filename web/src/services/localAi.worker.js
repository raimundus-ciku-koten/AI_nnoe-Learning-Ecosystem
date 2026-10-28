import { CreateMLCEngine } from '@mlc-ai/web-llm';

let engine = null;

async function handleRequest(message) {
  const { id, type, payload } = message;
  try {
    if (type === 'initialize') {
      if (!self.isSecureContext) {
        throw new Error('WebGPU memerlukan koneksi aman (HTTPS) atau localhost.');
      }
      if (!self.navigator?.gpu) {
        throw new Error('Worker ini tidak memiliki akses WebGPU. Gunakan browser yang mendukung WebGPU.');
      }
      const adapter = await self.navigator.gpu.requestAdapter();
      if (!adapter) throw new Error('GPU WebGPU tidak tersedia bagi worker ini.');
      const limits = adapter.limits;
      self.postMessage({
        id,
        type: 'preflight',
        limits: {
          maxBufferSize: limits.maxBufferSize,
          maxStorageBufferBindingSize: limits.maxStorageBufferBindingSize,
        },
      });
      const initProgressCallback = (report) => self.postMessage({
        id,
        type: 'progress',
        progress: {
          status: report.text || report.progress || 'Menyiapkan model lokal…',
          progress: Number.isFinite(report.progress) ? report.progress : null,
          model: payload.model,
        },
      });

      if (engine) {
        engine.setInitProgressCallback(initProgressCallback);
        await engine.reload(payload.id);
      } else {
        engine = await CreateMLCEngine(payload.id, { initProgressCallback });
      }
      self.postMessage({ id, type: 'complete' });
      return;
    }

    if (type === 'generate') {
      if (!engine) throw new Error('Engine AI lokal belum disiapkan.');
      const stream = await engine.chat.completions.create({
        messages: payload.messages,
        stream: true,
        temperature: payload.temperature,
        max_tokens: payload.maxTokens,
      });
      for await (const chunk of stream) {
        const token = chunk.choices?.[0]?.delta?.content;
        if (typeof token === 'string' && token) {
          self.postMessage({ id, type: 'token', token });
        }
      }
      self.postMessage({ id, type: 'complete' });
      return;
    }

    if (type === 'unload') {
      if (engine) await engine.unload();
      engine = null;
      self.postMessage({ id, type: 'complete' });
      return;
    }

    throw new TypeError(`Permintaan worker AI tidak dikenal: ${type}`);
  } catch (error) {
    self.postMessage({
      id,
      type: 'error',
      message: error instanceof Error ? error.message : 'Operasi AI lokal gagal.',
    });
  }
}

self.onmessage = (event) => {
  const message = event.data;
  if (message?.type === 'interrupt') {
    void engine?.interruptGenerate();
    return;
  }
  void handleRequest(message);
};
