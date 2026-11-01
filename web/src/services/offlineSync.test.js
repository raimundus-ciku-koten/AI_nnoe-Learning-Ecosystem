import { describe, expect, it } from 'vitest';
import { urutkanMutasiAntrean } from './offlineSync.js';

describe('offline sync queue', () => {
  it('sorts queued mutations by creation time and stable id', () => {
    const sorted = urutkanMutasiAntrean([
      { mutationId: 'b', createdAt: '2026-01-02T00:00:00.000Z' },
      { mutationId: 'z', createdAt: '2026-01-01T00:00:00.000Z' },
      { mutationId: 'a', createdAt: '2026-01-02T00:00:00.000Z' },
    ]);
    expect(sorted.map(({ mutationId }) => mutationId)).toEqual(['z', 'a', 'b']);
  });
});
