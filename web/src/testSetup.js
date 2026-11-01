import { vi } from 'vitest';

const fetchImplementation = globalThis.fetch.bind(globalThis);

vi.stubGlobal('fetch', async (input, init) => {
  if (String(input) === '/api/auth/session' && (!init?.method || init.method === 'GET')) {
    return Response.json(
      { error: 'Sesi login tidak tersedia.', code: 'auth_required' },
      { status: 401 },
    );
  }
  return fetchImplementation(input, init);
});
