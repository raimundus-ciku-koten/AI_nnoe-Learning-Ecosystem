import { describe, expect, it, vi } from 'vitest';

vi.mock('../lib/supabase.ts', () => ({ supabase: {} }));

import { resolveMfaFactors } from './PrivilegedMfaGate.jsx';

describe('administrator MFA factor selection', () => {
  it('retains a pending factor for verification instead of silently removing it', () => {
    expect(resolveMfaFactors([
      { id: 'pending-factor', status: 'unverified' },
    ])).toEqual({
      factorId: 'pending-factor',
      needsEnrollment: false,
      canReplaceFactor: true,
    });
  });

  it('prefers an existing verified factor and never offers replacement for it', () => {
    expect(resolveMfaFactors([
      { id: 'pending-factor', status: 'unverified' },
      { id: 'verified-factor', status: 'verified' },
    ])).toEqual({
      factorId: 'verified-factor',
      needsEnrollment: false,
      canReplaceFactor: false,
    });
  });

  it('requires an explicit enrollment action when no factor exists', () => {
    expect(resolveMfaFactors([])).toEqual({
      factorId: '',
      needsEnrollment: true,
      canReplaceFactor: false,
    });
  });
});
