const crypto = require('crypto');

// Mot de passe temporaire aléatoire (pas de caractères ambigus 0/O/1/l) pour les comptes
// provisionnés par un admin — remplace l'ancien mot de passe par défaut fixe 'Ecolio1234!',
// qui était identique pour tous les nouveaux comptes de la plateforme et documenté en clair
// dans l'UI, permettant à quiconque de se connecter à un compte avant son titulaire réel.
function generateTempPassword(length = 10) {
  const chars = 'ABCDEFGHJKMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789';
  const bytes = crypto.randomBytes(length);
  let out = '';
  for (let i = 0; i < length; i++) out += chars[bytes[i] % chars.length];
  return out;
}

module.exports = { generateTempPassword };
