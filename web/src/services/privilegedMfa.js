export async function inspectPrivilegedMfa(mfa) {
  const { data: assurance, error: assuranceError } =
    await mfa.getAuthenticatorAssuranceLevel();
  if (assuranceError) throw assuranceError;
  if (assurance?.currentLevel === 'aal2') {
    return {
      access: true,
      factorId: '',
      enrollmentRequired: false,
      pendingEnrollment: false,
    };
  }

  const { data: listed, error: listError } = await mfa.listFactors();
  if (listError) throw listError;

  const factors = Array.isArray(listed?.totp) ? listed.totp : [];
  const verified = factors.find((factor) => factor.status === 'verified');
  const pending = factors.find((factor) => factor.status === 'unverified');
  return {
    access: false,
    factorId: verified?.id ?? pending?.id ?? '',
    enrollmentRequired: !verified && !pending,
    pendingEnrollment: !verified && Boolean(pending),
  };
}

export function totpQrCodeImageSource(qrCode) {
  if (typeof qrCode !== 'string' || qrCode.length === 0) return '';
  if (qrCode.startsWith('data:image/svg+xml')) return qrCode;
  return `data:image/svg+xml;utf-8,${encodeURIComponent(qrCode)}`;
}
