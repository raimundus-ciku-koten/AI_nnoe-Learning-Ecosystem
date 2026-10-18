import {
  EXTERNAL_AI_PROVIDERS_ENABLED,
  getBrowserAiConnections,
  removeBrowserKey,
  setBrowserAiPreference,
  testAndSaveBrowserKey
} from './browserAi.js';

export { EXTERNAL_AI_PROVIDERS_ENABLED };
export const muatKoneksiAI = async (uid) => getBrowserAiConnections(uid);
export const simpanKunciPribadiAI = (uid, provider, apiKey) =>
  testAndSaveBrowserKey(uid, provider, apiKey);
export const hapusKunciPribadiAI = (uid, provider) =>
  removeBrowserKey(uid, provider);
export const simpanPreferensiAI = (uid, workflow, provider) =>
  setBrowserAiPreference(uid, workflow, provider);
export { generateBrowserQuestion as buatDrafSoalAI } from './browserAi.js';
