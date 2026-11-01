import { askBrowserAssistant, streamBrowserAssistant } from './browserAi.js';

export function tanyaAsisten(uid, messages, options) {
  return askBrowserAssistant(uid, messages, options);
}

export function tanyaAsistenStreaming(uid, messages, options) {
  return streamBrowserAssistant(uid, messages, options);
}
