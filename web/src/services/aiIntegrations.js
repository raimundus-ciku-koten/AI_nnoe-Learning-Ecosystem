import {
  askBrowserAssistant,
  getBrowserAiConnections,
  generateBrowserQuestion,
  removeBrowserKey,
  setBrowserAiPreference,
  startCanvaOAuth,
  testAndSaveBrowserKey,
} from './browserAi.js';

export const muatKoneksiAI = (uid) => getBrowserAiConnections(uid);
export const simpanKunciPribadiAI = (uid, provider, apiKey) =>
  testAndSaveBrowserKey(uid, provider, apiKey);
export const hapusKunciPribadiAI = (uid, provider) =>
  removeBrowserKey(uid, provider);
export const simpanPreferensiAI = (uid, workflow, provider) =>
  setBrowserAiPreference(uid, workflow, provider);
export const sambungkanCanva = (uid) => startCanvaOAuth(uid);
export { generateBrowserQuestion as buatDrafSoalAI, askBrowserAssistant };
