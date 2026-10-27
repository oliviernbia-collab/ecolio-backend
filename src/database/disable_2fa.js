// Dépannage : désactive la double authentification d'un compte qui a perdu à la fois son
// téléphone et ses codes de secours (ex. le super admin). À lancer uniquement sur le serveur,
// par une personne qui y a accès — volontairement non exposé par l'API.
// Ferme aussi toutes les sessions ouvertes du compte.
// Usage : node src/database/disable_2fa.js email@exemple.com
const dotenv = require('dotenv');
const path = require('path');
dotenv.config({ path: path.join(__dirname, '../../.env') });
const db = require('../config/database');

async function main() {
  const [email] = process.argv.slice(2);
  if (!email) {
    console.error('Usage: node src/database/disable_2fa.js <email>');
    process.exit(1);
  }
  const [[user]] = await db.execute('SELECT id, totp_enabled FROM users WHERE email = ?', [email]);
  if (!user) {
    console.error(`Aucun compte avec l'email ${email}.`);
    process.exit(1);
  }
  if (!user.totp_enabled) {
    console.log(`La double authentification n'est pas activée pour ${email}.`);
    process.exit(0);
  }
  await db.execute(
    'UPDATE users SET totp_enabled = 0, totp_secret = NULL, totp_last_step = NULL, token_version = token_version + 1 WHERE id = ?',
    [user.id]
  );
  await db.execute('DELETE FROM user_recovery_codes WHERE user_id = ?', [user.id]);
  await db.execute(
    "INSERT INTO activity_logs (user_id, action, entity_type, description) VALUES (?, '2fa_disable', 'auth', 'Double authentification désactivée depuis le serveur (disable_2fa.js)')",
    [user.id]
  );
  console.log(`✅ Double authentification désactivée pour ${email}. Réactivez-la dès la prochaine connexion.`);
  process.exit(0);
}

main().catch(err => { console.error('Erreur:', err.message); process.exit(1); });
