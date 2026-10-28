// Applique au démarrage les migrations récentes dont le code dépend directement, pour qu'une
// installation existante n'ait pas à les exécuter à la main. Chaque migration est rejouable :
// les erreurs « existe déjà » (colonne, table, index) sont ignorées, comme dans tests/globalSetup.js.
const fs = require('fs');
const path = require('path');
const db = require('../config/database');

const AUTO_MIGRATIONS = ['migration_v18.sql', 'migration_v19.sql', 'migration_v20.sql', 'migration_v21.sql'];
const IGNORABLE_ERRNOS = new Set([1060, 1061, 1050, 1826, 1022, 121]);

async function runFile(file) {
  const sql = fs.readFileSync(path.join(__dirname, '../database', file), 'utf8');
  const statements = sql.replace(/^\s*--.*$/gm, '').split(';').map(s => s.trim()).filter(Boolean);
  for (const stmt of statements) {
    try {
      await db.query(stmt);
    } catch (e) {
      if (!IGNORABLE_ERRNOS.has(e.errno)) throw e;
    }
  }
}

const ready = (async () => {
  for (const file of AUTO_MIGRATIONS) {
    try {
      await runFile(file);
    } catch (e) {
      console.error(`[Schema] Erreur lors de ${file}:`, e.message);
    }
  }
})();

module.exports = { ready };
