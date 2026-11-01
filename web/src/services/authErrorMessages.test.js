import { describe, expect, it } from 'vitest';
import { pesanLogin } from './authErrorMessages.js';

describe('pesanLogin', () => {
  it('explains a missing Preview app origin without blaming the Google provider', () => {
    const message = pesanLogin({ code: 'app_origin_not_configured' }, true);

    expect(message).toContain('APP_ORIGIN');
    expect(message).toContain('Supabase Auth');
    expect(message).toContain('(kode: app_origin_not_configured)');
    expect(message).not.toContain('Pastikan provider Google');
  });

  it('maps provider and infrastructure errors to actionable messages', () => {
    expect(pesanLogin({ code: 'oauth_provider_error' }, true))
      .toContain('Google membatalkan atau menolak');
    expect(pesanLogin({ code: 'auth_upstream_timeout' }, true))
      .toContain('tidak merespons');
  });

  it('keeps the generic fallback for unknown authentication failures', () => {
    expect(pesanLogin({ code: 'unknown_error' }))
      .toBe('Tidak dapat masuk saat ini. Silakan coba lagi. (kode: unknown_error)');
  });
});
