const db = require('../config/database');

// Cache en mémoire des permissions par rôle, rechargé périodiquement depuis
// role_permissions — évite une requête SQL sur chaque appel autorisé.
let cache = null;
let lastLoad = 0;
const TTL_MS = 60 * 1000;

async function loadPermissions() {
  const [rows] = await db.execute('SELECT role_code, permission_code FROM role_permissions');
  const map = {};
  for (const { role_code, permission_code } of rows) {
    if (!map[role_code]) map[role_code] = new Set();
    map[role_code].add(permission_code);
  }
  cache = map;
  lastLoad = Date.now();
  return map;
}

async function getPermissionMap() {
  if (!cache || Date.now() - lastLoad > TTL_MS) {
    await loadPermissions();
  }
  return cache;
}

async function roleHasPermission(role, permissionCode) {
  const map = await getPermissionMap();
  return !!map[role]?.has(permissionCode);
}

module.exports = { roleHasPermission, loadPermissions };
