export const EXTERNAL_AI_PROVIDERS_ENABLED = false;

const PROVIDERS = ['gemini', 'deepseek', 'groq'];
const WORKFLOWS = ['planning', 'assistant', 'questions'];
const AI_DISABLED_MESSAGE = 'Provider AI eksternal dinonaktifkan untuk mencegah biaya atau billing yang tidak disengaja.';

function rejectExternalAi() {
  throw new Error(AI_DISABLED_MESSAGE);
}

export function getBrowserAiConnections(uid) {
  if (!uid) throw new Error('Sesi login tidak tersedia. Masuk kembali.');
  return {
    providers: Object.fromEntries(PROVIDERS.map((provider) => [
      provider,
      { personal: false, platform: false, available: false },
    ])),
    preferences: Object.fromEntries(WORKFLOWS.map((workflow) => [workflow, 'auto'])),
    personalKeysEnabled: false,
  };
}

export async function testAndSaveBrowserKey() {
  rejectExternalAi();
}

export function removeBrowserKey() {
  rejectExternalAi();
}

export function clearBrowserAiSession() {}

export function setBrowserAiPreference() {
  rejectExternalAi();
}

export async function generateBrowserQuestion() {
  rejectExternalAi();
}

export async function askBrowserAssistant() {
  rejectExternalAi();
}

export async function generateBrowserPlanning() {
  rejectExternalAi();
}
