const {
  HttpError,
  adminRequest,
  authenticateRequest,
  fail,
  requireMethod,
  requireSameOrigin,
  sendJson,
} = require('./_lib/common.js');
const { containsLikelyPersonalData } = require('./_lib/privacy.js');

const WORKFLOWS = new Set(['planning', 'assistant', 'questions']);

function readCloudConfig() {
  const endpoint = process.env.CLOUD_AI_API_URL?.trim();
  const apiKey = process.env.CLOUD_AI_API_KEY?.trim();
  const model = process.env.CLOUD_AI_MODEL?.trim();
  if (!endpoint || !apiKey || !model) {
    throw new HttpError(503, 'Provider AI cloud belum dikonfigurasi di server.', 'cloud_ai_not_configured');
  }
  let url;
  try {
    url = new URL(endpoint);
  } catch {
    throw new HttpError(503, 'Endpoint AI cloud server tidak valid.', 'cloud_ai_config_invalid');
  }
  if (url.protocol !== 'https:' || url.username || url.password) {
    throw new HttpError(503, 'Endpoint AI cloud harus HTTPS dan tidak boleh memuat kredensial URL.', 'cloud_ai_config_invalid');
  }
  return { endpoint: url.toString(), apiKey, model };
}

module.exports = async function handler(req, res) {
  try {
    requireMethod(req, ['POST']);
    requireSameOrigin(req);
    const { user } = await authenticateRequest(req);
    const { workflow, prompt, allowCloud, sensitivity } = req.body || {};
    if (!WORKFLOWS.has(workflow)) throw new HttpError(400, 'Workflow AI tidak dikenal.', 'ai_workflow_invalid');
    if (typeof prompt !== 'string' || !prompt.trim() || prompt.length > 20000) {
      throw new HttpError(400, 'Prompt AI harus berupa teks 1–20.000 karakter.', 'ai_prompt_invalid');
    }
    if (allowCloud !== true) throw new HttpError(403, 'Pengiriman ke AI cloud memerlukan persetujuan eksplisit untuk permintaan ini.', 'cloud_consent_required');
    if (sensitivity !== 'non_sensitive') {
      throw new HttpError(403, 'Data yang ditandai sensitif hanya boleh diproses oleh AI lokal.', 'sensitive_data_blocked');
    }
    if (containsLikelyPersonalData(prompt)) {
      throw new HttpError(403, 'Prompt memuat pola identitas pribadi dan diblokir dari AI cloud.', 'personal_data_blocked');
    }
    const { endpoint, apiKey, model } = readCloudConfig();
    const quotaAvailable = await adminRequest('rpc/consume_cloud_ai_quota', {
      method: 'POST',
      body: { p_user_id: user.id },
    });
    if (quotaAvailable !== true) {
      throw new HttpError(429, 'Batas penggunaan AI cloud harian tercapai.', 'cloud_ai_daily_limit');
    }
    const response = await fetch(endpoint, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model,
        messages: [{ role: 'user', content: prompt }],
        max_tokens: 1200,
      }),
      signal: AbortSignal.timeout(30000),
    });
    const result = await response.json().catch(() => ({}));
    if (!response.ok) {
      console.error('[api] Cloud AI provider error:', response.status, result?.error?.code || 'unknown');
      throw new HttpError(response.status === 429 ? 429 : 502, 'Provider AI cloud tidak dapat memproses permintaan.', response.status === 429 ? 'cloud_ai_rate_limited' : 'cloud_ai_failed');
    }
    const text = result?.choices?.[0]?.message?.content;
    if (typeof text !== 'string' || !text.trim()) {
      throw new HttpError(502, 'Provider AI cloud mengembalikan respons kosong atau tidak valid.', 'cloud_ai_response_invalid');
    }
    sendJson(res, 200, { text, provider: 'cloud', model });
  } catch (error) {
    fail(res, error);
  }
};
