import { beforeEach, describe, expect, it, vi } from 'vitest';

const invokeMock = vi.hoisted(() => vi.fn());
vi.mock('../lib/supabase.ts', () => ({
  supabase: { functions: { invoke: invokeMock } },
}));

import { jalankanAiUserService } from './aiUserServices.js';

describe('AI user service gateway', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('invokes the authenticated AI Edge Function with a named action', async () => {
    invokeMock.mockResolvedValue({ data: { configured: true }, error: null });

    await expect(jalankanAiUserService('status')).resolves.toEqual({ configured: true });
    expect(invokeMock).toHaveBeenCalledWith('ai-user-services', { body: { action: 'status' } });
  });

  it('starts the Canva OAuth function without sending credentials from the browser', async () => {
    invokeMock.mockResolvedValue({ data: { authorizationUrl: 'https://www.canva.com/api/oauth/authorize' }, error: null });

    await jalankanAiUserService('canva-oauth-start');
    expect(invokeMock).toHaveBeenCalledWith('canva-oauth-start', { body: {} });
  });

  it('uses currently supported low-cost model IDs for DeepSeek and Groq', async () => {
    const { readFileSync } = await import('node:fs');
    const source = readFileSync(
      new URL('../../../supabase/functions/ai-user-services/index.ts', import.meta.url),
      'utf8',
    );

    expect(source).toContain("'deepseek-flash'");
    expect(source).toContain("'openai/gpt-oss-20b'");
    expect(source).not.toMatch(/deepseek-chat|llama-3\.3-70b-versatile/);
  });

  it('surfaces a safe backend error response', async () => {
    invokeMock.mockResolvedValue({
      data: null,
      error: {
        message: 'Edge Function returned a non-2xx status code',
        context: new Response(JSON.stringify({ error: 'Akun belum aktif.' }), {
          status: 403,
          headers: { 'content-type': 'application/json' },
        }),
      },
    });

    await expect(jalankanAiUserService('status')).rejects.toThrow('Akun belum aktif.');
  });
});
