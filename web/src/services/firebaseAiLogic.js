import { app, appCheck, ambilTokenAppCheck } from '../firebase/core/app.js';

export async function generateFirebaseAiLogic(prompt) {
  if (typeof prompt !== 'string' || !prompt.trim() || prompt.length > 5000) {
    throw new Error('Prompt harus berisi 1–5.000 karakter.');
  }
  if (!appCheck) {
    throw new Error('Firebase App Check belum aktif. Periksa site key dan domain produksi.');
  }

  let token;
  try {
    token = await ambilTokenAppCheck();
  } catch (cause) {
    throw new Error(
      'Gagal memperoleh token App Check. Periksa site key reCAPTCHA Enterprise dan domain produksi di Firebase Console.',
      { cause }
    );
  }
  if (!token?.token) {
    throw new Error('App Check tidak menghasilkan token valid. Permintaan AI Logic dibatalkan.');
  }

  const { getAI, getGenerativeModel, GoogleAIBackend } = await import('firebase/ai');
  const ai = getAI(app, { backend: new GoogleAIBackend() });
  const model = getGenerativeModel(ai, {
    model: 'gemini-2.5-flash',
    generationConfig: { temperature: 0.5, maxOutputTokens: 1024 }
  });
  const result = await model.generateContent(prompt.trim());
  const answer = result.response.text().trim();
  if (!answer) throw new Error('Firebase AI Logic mengembalikan respons kosong.');
  return answer;
}
