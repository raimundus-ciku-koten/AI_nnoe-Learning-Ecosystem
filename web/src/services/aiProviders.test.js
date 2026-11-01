import { afterEach, describe, expect, it, vi } from 'vitest';

import { routeAiRequest } from './aiProviders.js';

describe('privacy-aware AI providers', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('uses the localhost provider by default and labels it AI_nnoe', async () => {
    const fetch = vi.fn(async () => Response.json({
      model: 'local-test',
      message: { content: 'Siap.' },
    }));
    vi.stubGlobal('fetch', fetch);
    const result = await routeAiRequest({
      workflow: 'assistant',
      prompt: 'Balas dengan satu kata.',
    });
    expect(result).toMatchObject({ provider: 'local', model: 'local-test', text: 'Siap.' });
    expect(String(fetch.mock.calls[0][0])).toBe('http://127.0.0.1:11434/api/chat');
  });

  it('never falls back to cloud for sensitive content', async () => {
    const fetch = vi.fn(async () => { throw new Error('local runtime unavailable'); });
    vi.stubGlobal('fetch', fetch);
    await expect(routeAiRequest({
      workflow: 'assistant',
      prompt: 'Data internal',
      sensitivity: 'sensitive',
      allowCloud: true,
    })).rejects.toThrow('local runtime unavailable');
    expect(fetch).toHaveBeenCalledTimes(1);
    expect(String(fetch.mock.calls[0][0])).toContain('127.0.0.1');
  });

  it('requires explicit consent before selecting cloud', async () => {
    const fetch = vi.fn();
    vi.stubGlobal('fetch', fetch);
    await expect(routeAiRequest({
      workflow: 'assistant',
      prompt: 'General prompt',
      preference: 'cloud',
      sensitivity: 'non_sensitive',
      allowCloud: false,
    })).rejects.toThrow('persetujuan cloud');
    expect(fetch).not.toHaveBeenCalled();
  });

  it('rejects cloud use for sensitive content even with user consent', async () => {
    const fetch = vi.fn();
    vi.stubGlobal('fetch', fetch);
    await expect(routeAiRequest({
      workflow: 'assistant',
      prompt: 'Student data',
      preference: 'cloud',
      sensitivity: 'sensitive',
      allowCloud: true,
    })).rejects.toThrow('Data sensitif');
    expect(fetch).not.toHaveBeenCalled();
  });
});
