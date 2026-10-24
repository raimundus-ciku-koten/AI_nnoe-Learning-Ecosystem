import { cariMenu, menuUntukPeran } from '../navigasi.js';

export function isMenuPathDisabled(disabledKeys, role, path, search = '') {
  if (!disabledKeys?.size) return false;
  const match = cariMenu(path, search, role) || menuUntukPeran(role)
    .flatMap((group) => group.item.map((item) => ({ grup: group, item })))
    .filter(({ item }) => item.path === path || path.startsWith(`${item.path}/`))
    .sort((left, right) => right.item.path.length - left.item.path.length)[0];
  if (!match) return true;
  return disabledKeys.has(`group:${match.grup.id}`)
    || disabledKeys.has(`path:${match.item.path}`);
}
