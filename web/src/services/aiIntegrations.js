import {
  getBrowserAiConnections,
  removeBrowserKey,
  setBrowserAiPreference,
  testAndSaveBrowserKey
} from './browserAi.js';

export const muatKoneksiAI = async (uid) => getBrowserAiConnections(uid);
export const simpanKunciPribadiAI = (uid, provider, apiKey) =>
  testAndSaveBrowserKey(uid, provider, apiKey);
export const hapusKunciPribadiAI = (uid, provider) =>
  removeBrowserKey(uid, provider);
export const simpanPreferensiAI = (uid, workflow, provider) =>
  setBrowserAiPreference(uid, workflow, provider);
export { generateBrowserQuestion as buatDrafSoalAI } from './browserAi.js';
