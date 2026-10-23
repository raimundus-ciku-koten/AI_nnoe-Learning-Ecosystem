export function createAuthRedirectUrl(location, searchParams = {}) {
  const redirectTo = new URL(location.pathname, location.origin);
  Object.entries(searchParams).forEach(([key, value]) => {
    redirectTo.searchParams.set(key, value);
  });
  redirectTo.hash = '/login';
  return redirectTo.toString();
}
