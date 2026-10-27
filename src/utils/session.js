// Sessions : JWT transmis au navigateur dans un cookie httpOnly (illisible par JavaScript, donc
// hors de portée d'un script injecté par XSS), ou dans l'en-tête Authorization pour les clients
// API (tests, future application mobile). Chaque JWT porte un identifiant unique (jti) révocable
// à la déconnexion, et la token_version de l'utilisateur, incrémentée à chaque changement de
// mot de passe pour fermer toutes ses sessions d'un coup.
const crypto = require('crypto');
const jwt = require('jsonwebtoken');
const db = require('../config/database');
const { ready } = require('../services/schema');

const COOKIE_NAME = 'ecolio_session';
const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);

const isProd = () => process.env.NODE_ENV === 'production';
const expiresIn = () => process.env.JWT_EXPIRES_IN || '1d';

function cookieOptions(maxAgeMs) {
  return {
    httpOnly: true,
    secure: isProd(),
    // Lax : le cookie n'est pas envoyé par les formulaires POST d'autres sites (protection CSRF de base)
    sameSite: 'lax',
    path: '/api',
    ...(maxAgeMs !== undefined ? { maxAge: maxAgeMs } : {}),
  };
}

function readCookie(req, name) {
  const header = req.headers.cookie;
  if (!header) return null;
  for (const part of header.split(';')) {
    const idx = part.indexOf('=');
    if (idx > -1 && part.slice(0, idx).trim() === name) return decodeURIComponent(part.slice(idx + 1).trim());
  }
  return null;
}

// Crée la session, pose le cookie et renvoie le JWT (pour les clients qui utilisent l'en-tête).
function issueSession(res, user) {
  const token = jwt.sign(
    { id: user.id, role: user.role, school_id: user.school_id, tv: user.token_version || 0 },
    process.env.JWT_SECRET,
    { expiresIn: expiresIn(), jwtid: crypto.randomBytes(16).toString('hex') }
  );
  const { exp, iat } = jwt.decode(token);
  res.cookie(COOKIE_NAME, token, cookieOptions((exp - iat) * 1000));
  return token;
}

function clearSession(res) {
  res.clearCookie(COOKIE_NAME, cookieOptions());
}

class SessionError extends Error {
  constructor(message, status = 401) { super(message); this.status = status; }
}

// Lit et vérifie la session de la requête. Renvoie { decoded, user } ou null s'il n'y a pas de
// session ; lève SessionError si la session est invalide, expirée ou révoquée.
async function readSession(req, { userColumns = 'u.id, u.school_id, u.role, u.first_name, u.last_name, u.email, u.phone' } = {}) {
  const header = req.headers.authorization;
  const fromHeader = header && header.startsWith('Bearer ') ? header.slice(7) : null;
  const token = fromHeader || readCookie(req, COOKIE_NAME);
  if (!token) return null;

  // Un cookie est envoyé automatiquement par le navigateur : pour les requêtes qui modifient des
  // données, on exige en plus un en-tête personnalisé, qu'un autre site ne peut pas ajouter sans
  // passer la vérification CORS (protection CSRF).
  if (!fromHeader && !SAFE_METHODS.has(req.method) && req.headers['x-requested-with'] !== 'XMLHttpRequest') {
    throw new SessionError('Requête refusée (protection CSRF)', 403);
  }

  let decoded;
  try {
    decoded = jwt.verify(token, process.env.JWT_SECRET);
  } catch {
    throw new SessionError('Session invalide ou expirée');
  }
  // Jeton à usage particulier (ex. étape 2FA) : jamais accepté comme session
  if (decoded.purpose) throw new SessionError('Session invalide ou expirée');

  await ready;
  if (decoded.jti) {
    const [revoked] = await db.execute('SELECT 1 FROM revoked_tokens WHERE jti = ?', [decoded.jti]);
    if (revoked.length) throw new SessionError('Session fermée, reconnectez-vous');
  }
  const [rows] = await db.execute(
    `SELECT ${userColumns}, u.token_version,
            s.is_active as school_is_active, s.trial_ends_at, s.subscription_paid_until
     FROM users u LEFT JOIN schools s ON u.school_id = s.id
     WHERE u.id = ? AND u.is_active = 1`,
    [decoded.id]
  );
  const user = rows[0];
  if (!user) throw new SessionError('Utilisateur non trouvé ou désactivé');
  if ((user.token_version || 0) !== (decoded.tv || 0)) {
    throw new SessionError('Votre session a été fermée par sécurité, reconnectez-vous');
  }
  delete user.token_version;
  return { decoded, user };
}

// Déconnexion : le jti est mis en liste noire jusqu'à l'expiration naturelle du JWT.
async function revokeSession(decoded) {
  if (!decoded?.jti) return;
  await ready;
  await db.execute(
    'INSERT IGNORE INTO revoked_tokens (jti, expires_at) VALUES (?, FROM_UNIXTIME(?))',
    [decoded.jti, decoded.exp]
  );
  await db.execute('DELETE FROM revoked_tokens WHERE expires_at < NOW()');
}

// Ferme toutes les sessions d'un utilisateur (changement ou réinitialisation de mot de passe).
// Renvoie la nouvelle version, pour réémettre une session à l'utilisateur courant si besoin.
async function revokeAllSessions(userId) {
  await ready;
  await db.execute('UPDATE users SET token_version = token_version + 1 WHERE id = ?', [userId]);
  const [[row]] = await db.execute('SELECT token_version FROM users WHERE id = ?', [userId]);
  return row?.token_version || 0;
}

module.exports = { issueSession, clearSession, readSession, revokeSession, revokeAllSessions, SessionError, COOKIE_NAME };
