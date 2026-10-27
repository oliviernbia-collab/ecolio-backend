// Double authentification (2FA) par application TOTP. Configuration en deux temps :
// /setup génère un secret (pas encore actif) et son QR code, /enable l'active une fois qu'un
// premier code a été validé — ainsi un utilisateur ne peut pas s'enfermer dehors avec une
// application mal configurée. À l'activation, 10 codes de secours à usage unique sont fournis.
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const QRCode = require('qrcode');
const db = require('../config/database');
const { handleError } = require('../utils/errors');
const { logActivity } = require('../services/activityLog');
const { ready } = require('../services/schema');
const totp = require('../utils/totp');

const CHALLENGE_TTL = '5m';
// Clé distincte de celle des sessions : un jeton d'étape 2FA ne peut jamais servir de session
const challengeSecret = () => `${process.env.JWT_SECRET}:2fa-challenge`;

const actor = (req) => ({
  schoolId: req.user.school_id, userId: req.user.id, userName: `${req.user.first_name} ${req.user.last_name}`,
  userRole: req.user.role, ip: req.ip,
});

async function loadTwoFactor(userId) {
  await ready;
  const [[row]] = await db.execute(
    'SELECT id, email, password, totp_secret, totp_enabled, totp_last_step FROM users WHERE id = ?', [userId]
  );
  return row;
}

async function storeRecoveryCodes(userId) {
  const codes = totp.generateRecoveryCodes();
  await db.execute('DELETE FROM user_recovery_codes WHERE user_id = ?', [userId]);
  for (const code of codes) {
    await db.execute('INSERT INTO user_recovery_codes (user_id, code_hash) VALUES (?, ?)', [userId, totp.hashRecoveryCode(code)]);
  }
  return codes;
}

// Vérifie un code de l'application (en marquant le pas de temps comme utilisé) ou, à défaut,
// un code de secours (alors consommé). Renvoie 'totp', 'recovery' ou null.
async function checkSecondFactor(row, code) {
  if (!row?.totp_secret || !code) return null;
  const step = totp.verifyCode(totp.decryptSecret(row.totp_secret), code, { lastStep: row.totp_last_step });
  if (step !== null) {
    // Mise à jour conditionnelle : deux requêtes simultanées avec le même code ne passent pas toutes les deux
    const [r] = await db.execute(
      'UPDATE users SET totp_last_step = ? WHERE id = ? AND (totp_last_step IS NULL OR totp_last_step < ?)',
      [step, row.id, step]
    );
    return r.affectedRows ? 'totp' : null;
  }
  const normalized = totp.normalizeRecoveryCode(code);
  if (normalized.length !== totp.RECOVERY_LENGTH) return null;
  const [r] = await db.execute(
    'UPDATE user_recovery_codes SET used_at = NOW() WHERE user_id = ? AND code_hash = ? AND used_at IS NULL LIMIT 1',
    [row.id, totp.hashRecoveryCode(code)]
  );
  return r.affectedRows ? 'recovery' : null;
}

// ── Étape de connexion ─────────────────────────────────────────────────────────

function createChallenge(user) {
  return jwt.sign({ id: user.id, purpose: '2fa', tv: user.token_version || 0 }, challengeSecret(), { expiresIn: CHALLENGE_TTL });
}

// Utilisé par auth.controller.login : renvoie l'utilisateur si le jeton d'étape et le code sont valides
async function resolveChallenge(challengeToken, code) {
  let decoded;
  try {
    decoded = jwt.verify(String(challengeToken || ''), challengeSecret());
  } catch {
    return { error: 'Délai dépassé, reconnectez-vous avec votre mot de passe', status: 401 };
  }
  if (decoded.purpose !== '2fa') return { error: 'Jeton invalide', status: 401 };
  const row = await loadTwoFactor(decoded.id);
  if (!row?.totp_enabled) return { error: 'Jeton invalide', status: 401 };
  const method = await checkSecondFactor(row, code);
  if (!method) return { error: 'Code incorrect ou déjà utilisé', status: 401, userId: row.id };
  return { userId: row.id, method };
}

// ── Gestion depuis Paramètres ──────────────────────────────────────────────────

// GET /auth/2fa — état de la 2FA de l'utilisateur connecté
exports.status = async (req, res) => {
  try {
    const row = await loadTwoFactor(req.user.id);
    const [[{ remaining }]] = await db.execute(
      'SELECT COUNT(*) as remaining FROM user_recovery_codes WHERE user_id = ? AND used_at IS NULL', [req.user.id]
    );
    res.json({ success: true, enabled: !!row.totp_enabled, recovery_codes_remaining: Number(remaining) });
  } catch (err) { handleError(res, err); }
};

// POST /auth/2fa/setup — nouveau secret + QR code (pas encore actif)
exports.setup = async (req, res) => {
  try {
    const row = await loadTwoFactor(req.user.id);
    if (row.totp_enabled) return res.status(400).json({ success: false, message: 'La double authentification est déjà activée' });
    const secret = totp.generateSecret();
    await db.execute('UPDATE users SET totp_secret = ?, totp_last_step = NULL WHERE id = ?', [totp.encryptSecret(secret), req.user.id]);
    const uri = totp.otpauthUri(secret, row.email);
    const qr = await QRCode.toDataURL(uri, { margin: 1, width: 220 });
    res.json({ success: true, secret, otpauth_uri: uri, qr });
  } catch (err) { handleError(res, err); }
};

// POST /auth/2fa/enable — { code } : confirme la configuration avec un premier code
exports.enable = async (req, res) => {
  try {
    const row = await loadTwoFactor(req.user.id);
    if (row.totp_enabled) return res.status(400).json({ success: false, message: 'La double authentification est déjà activée' });
    if (!row.totp_secret) return res.status(400).json({ success: false, message: 'Commencez par scanner le QR code' });
    const step = totp.verifyCode(totp.decryptSecret(row.totp_secret), req.body.code);
    if (step === null) return res.status(400).json({ success: false, message: "Code incorrect. Vérifiez l'heure de votre téléphone et réessayez." });

    await db.execute('UPDATE users SET totp_enabled = 1, totp_last_step = ? WHERE id = ?', [step, req.user.id]);
    const recoveryCodes = await storeRecoveryCodes(req.user.id);
    logActivity({ ...actor(req), action: '2fa_enable', entityType: 'auth', description: 'Double authentification activée' });
    res.json({ success: true, message: 'Double authentification activée', recovery_codes: recoveryCodes });
  } catch (err) { handleError(res, err); }
};

// POST /auth/2fa/disable — { password, code } : mot de passe ET code (application ou secours)
exports.disable = async (req, res) => {
  try {
    const row = await loadTwoFactor(req.user.id);
    if (!row.totp_enabled) return res.status(400).json({ success: false, message: "La double authentification n'est pas activée" });
    if (!(await bcrypt.compare(String(req.body.password || ''), row.password))) {
      return res.status(400).json({ success: false, message: 'Mot de passe incorrect' });
    }
    if (!(await checkSecondFactor(row, req.body.code))) {
      return res.status(400).json({ success: false, message: 'Code incorrect ou déjà utilisé' });
    }
    await db.execute('UPDATE users SET totp_enabled = 0, totp_secret = NULL, totp_last_step = NULL WHERE id = ?', [req.user.id]);
    await db.execute('DELETE FROM user_recovery_codes WHERE user_id = ?', [req.user.id]);
    logActivity({ ...actor(req), action: '2fa_disable', entityType: 'auth', description: 'Double authentification désactivée' });
    res.json({ success: true, message: 'Double authentification désactivée' });
  } catch (err) { handleError(res, err); }
};

// POST /auth/2fa/recovery-codes — { code } : remplace les codes de secours (les anciens deviennent invalides)
exports.regenerateRecoveryCodes = async (req, res) => {
  try {
    const row = await loadTwoFactor(req.user.id);
    if (!row.totp_enabled) return res.status(400).json({ success: false, message: "La double authentification n'est pas activée" });
    if ((await checkSecondFactor(row, req.body.code)) !== 'totp') {
      return res.status(400).json({ success: false, message: "Code de l'application incorrect" });
    }
    const recoveryCodes = await storeRecoveryCodes(req.user.id);
    logActivity({ ...actor(req), action: '2fa_recovery', entityType: 'auth', description: 'Nouveaux codes de secours générés' });
    res.json({ success: true, recovery_codes: recoveryCodes });
  } catch (err) { handleError(res, err); }
};

module.exports.createChallenge = createChallenge;
module.exports.resolveChallenge = resolveChallenge;
