const db = require('../config/database');

// Cache en mémoire des permissions par rôle (role_permissions) et des écarts individuels
// accordés ou retirés par le directeur (user_permissions), rechargé périodiquement — évite
// une requête SQL sur chaque appel autorisé. Rechargé aussi juste après chaque modification.
let cache = null;
let lastLoad = 0;
const TTL_MS = 60 * 1000;

async function loadPermissions() {
  const [[rows], [overrides]] = await Promise.all([
    db.execute('SELECT role_code, permission_code FROM role_permissions'),
    db.execute('SELECT user_id, permission_code, granted FROM user_permissions'),
  ]);
  const roles = {};
  for (const { role_code, permission_code } of rows) {
    if (!roles[role_code]) roles[role_code] = new Set();
    roles[role_code].add(permission_code);
  }
  const users = {};
  for (const { user_id, permission_code, granted } of overrides) {
    if (!users[user_id]) users[user_id] = { granted: new Set(), revoked: new Set() };
    users[user_id][granted ? 'granted' : 'revoked'].add(permission_code);
  }
  cache = { roles, users };
  lastLoad = Date.now();
  return cache;
}

async function getPermissionMap() {
  if (!cache || Date.now() - lastLoad > TTL_MS) {
    await loadPermissions();
  }
  return cache;
}

async function roleHasPermission(role, permissionCode) {
  const map = await getPermissionMap();
  return !!map.roles[role]?.has(permissionCode);
}

// Permission effective d'un utilisateur : celles de son rôle, plus les accordées, moins les retirées.
async function userHasPermission(user, permissionCode) {
  const map = await getPermissionMap();
  const own = map.users[user.id];
  if (own?.revoked.has(permissionCode)) return false;
  if (own?.granted.has(permissionCode)) return true;
  return !!map.roles[user.role]?.has(permissionCode);
}

// Envoyé au frontend (connexion, /auth/me) pour adapter le menu aux écarts individuels.
async function getUserPermissions(user) {
  const map = await getPermissionMap();
  const own = map.users[user.id] || { granted: new Set(), revoked: new Set() };
  const effective = new Set(map.roles[user.role] || []);
  for (const code of own.granted) effective.add(code);
  for (const code of own.revoked) effective.delete(code);
  return {
    permissions: [...effective].sort(),
    permissions_granted: [...own.granted].sort(),
    permissions_revoked: [...own.revoked].sort(),
  };
}

module.exports = { roleHasPermission, userHasPermission, getUserPermissions, loadPermissions };
