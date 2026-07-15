// Crée un compte super-admin plateforme (school_id = NULL), volontairement non exposé
// via l'inscription publique — c'est un compte opérateur de la plateforme SaaS, pas d'une école cliente.
// Usage : node src/database/create_super_admin.js email@exemple.com MotDePasse123! Prénom Nom
const bcrypt = require('bcryptjs');
const dotenv = require('dotenv');
const path = require('path');
dotenv.config({ path: path.join(__dirname, '../../.env') });
const db = require('../config/database');

async function main() {
  const [email, password, firstName, lastName] = process.argv.slice(2);
  if (!email || !password || !firstName || !lastName) {
    console.error('Usage: node src/database/create_super_admin.js <email> <mot_de_passe> <prénom> <nom>');
    process.exit(1);
  }
  if (password.length < 8) {
    console.error('Le mot de passe doit contenir au moins 8 caractères.');
    process.exit(1);
  }

  const [existing] = await db.execute('SELECT id FROM users WHERE email = ?', [email]);
  if (existing.length) {
    console.error(`Un compte existe déjà avec cet email (id=${existing[0].id}).`);
    process.exit(1);
  }

  const hash = await bcrypt.hash(password, 10);
  const [result] = await db.execute(
    'INSERT INTO users (school_id, first_name, last_name, email, password, role) VALUES (NULL, ?, ?, ?, ?, ?)',
    [firstName, lastName, email, hash, 'super_admin']
  );
  console.log(`✅ Compte super-admin plateforme créé (id=${result.insertId}, email=${email}).`);
  process.exit(0);
}

main().catch(err => { console.error('Erreur:', err.message); process.exit(1); });
