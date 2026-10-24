const MFA_REQUIRED_ROLES = new Set(['admin', 'admin_sekolah', 'superadmin']);

export function requiresPrivilegedMfa(role) {
  return MFA_REQUIRED_ROLES.has(String(role || '').trim().toLowerCase());
}

export function isMaintenanceBlocked(role, maintenance) {
  return maintenance === true
    && String(role || '').trim().toLowerCase() !== 'superadmin';
}
