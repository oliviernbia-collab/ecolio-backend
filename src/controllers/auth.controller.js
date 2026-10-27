const bcrypt = require('bcryptjs');
const db = require('../config/database');
const { issueSession, clearSession, revokeSession, revokeAllSessions } = require('../utils/session');
const { ready: schemaReady } = require('../services/schema');
const twoFactor = require('./twoFactor.controller');

const MAX_RESETS_PER_DAY = 5;
const { handleError } = require('../utils/errors');
const { logActivity } = require('../services/activityLog');
const { getSubscriptionState, TRIAL_DAYS } = require('../services/subscription');
const { generateTempPassword } = require('../utils/password');

// Auto-migration : ajoute la colonne must_change_password si elle n'existe pas encore
;(async () => {
  try {
    const [cols] = await db.execute(
      "SELECT 1 FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'users' AND COLUMN_NAME = 'must_change_password'"
    );
    if (!cols.length) {
      await db.execute(
        "ALTER TABLE users ADD COLUMN must_change_password TINYINT(1) NOT NULL DEFAULT 0 AFTER password"
      );
      console.log('[Auth] Colonne must_change_password ajoutée à users');
    }
  } catch (e) {
    console.error('[Auth] Erreur auto-migration:', e.message);
  }
})();

exports.login = async (req, res) => {
  try {
    await schemaReady;
    const { email, password } = req.body;
    if (!email || !password) {
      return res.status(400).json({ success: false, message: 'Email et mot de passe requis' });
    }

    const [users] = await db.execute(
      `SELECT u.*, s.name as school_name, s.primary_color, s.secondary_color, s.logo_url as school_logo,
              s.is_active as school_is_active, s.trial_ends_at, s.subscription_paid_until
       FROM users u
       LEFT JOIN schools s ON u.school_id = s.id
       WHERE u.email = ? AND u.is_active = 1`,
      [email]
    );

    if (!users.length) {
      logActivity({ action: 'login_failed', entityType: 'auth', description: `Tentative de connexion échouée : ${email}`, ip: req.ip });
      return res.status(401).json({ success: false, message: 'Email ou mot de passe incorrect' });
    }

    const user = users[0];
    const valid = await bcrypt.compare(password, user.password);
    if (!valid) {
      logActivity({
        schoolId: user.school_id, userId: user.id, userName: `${user.first_name} ${user.last_name}`, userRole: user.role,
        action: 'login_failed', entityType: 'auth', description: 'Mot de passe incorrect', ip: req.ip,
      });
      return res.status(401).json({ success: false, message: 'Email ou mot de passe incorrect' });
    }

    if (user.school_id && user.school_is_active === 0) {
      return res.status(403).json({ success: false, message: 'Cette école a été suspendue. Contactez le support Écolio.' });
    }
    delete user.school_is_active;

    // Double authentification activée : le mot de passe ne suffit pas, on renvoie un jeton
    // d'étape (5 min) à échanger contre une session avec le code de l'application.
    if (user.totp_enabled) {
      return res.json({ success: true, two_factor_required: true, challenge_token: twoFactor.createChallenge(user) });
    }

    await finishLogin(req, res, user, 'Connexion réussie');
  } catch (err) {
    handleError(res, err);
  }
};

const LOGIN_USER_QUERY = `SELECT u.*, s.name as school_name, s.primary_color, s.secondary_color, s.logo_url as school_logo,
         s.is_active as school_is_active, s.trial_ends_at, s.subscription_paid_until
  FROM users u
  LEFT JOIN schools s ON u.school_id = s.id`;

async function finishLogin(req, res, user, description) {
  await db.execute('UPDATE users SET last_login = NOW() WHERE id = ?', [user.id]);
  logActivity({
    schoolId: user.school_id, userId: user.id, userName: `${user.first_name} ${user.last_name}`, userRole: user.role,
    action: 'login', entityType: 'auth', description, ip: req.ip,
  });

  // Le navigateur reçoit la session dans un cookie httpOnly ; le token reste renvoyé dans la
  // réponse pour les clients API (tests, future application mobile), le site web l'ignore.
  const token = issueSession(res, user);

  const subscription = user.school_id ? getSubscriptionState(user) : null;
  for (const field of ['password', 'token_version', 'trial_ends_at', 'subscription_paid_until', 'totp_secret', 'totp_last_step', 'school_is_active']) {
    delete user[field];
  }
  res.json({ success: true, token, user: { ...user, subscription } });
}

// POST /auth/login/2fa — { challenge_token, code } : deuxième étape de connexion
exports.loginTwoFactor = async (req, res) => {
  try {
    const result = await twoFactor.resolveChallenge(req.body.challenge_token, req.body.code);
    if (result.error) {
      if (result.userId) {
        logActivity({ userId: result.userId, action: 'login_failed', entityType: 'auth', description: 'Code de double authentification incorrect', ip: req.ip });
      }
      return res.status(result.status).json({ success: false, message: result.error });
    }
    const [[user]] = await db.execute(`${LOGIN_USER_QUERY} WHERE u.id = ? AND u.is_active = 1`, [result.userId]);
    if (!user) return res.status(401).json({ success: false, message: 'Compte désactivé' });
    if (user.school_id && user.school_is_active === 0) {
      return res.status(403).json({ success: false, message: 'Cette école a été suspendue. Contactez le support Écolio.' });
    }
    await finishLogin(req, res, user, result.method === 'recovery'
      ? 'Connexion réussie (2FA, code de secours utilisé)'
      : 'Connexion réussie (2FA)');
  } catch (err) {
    handleError(res, err);
  }
};

exports.register = async (req, res) => {
  try {
    const { school, admin } = req.body;

    if (!school?.name) {
      return res.status(400).json({ success: false, message: "Le nom de l'école est requis" });
    }
    if (!admin?.email || !admin?.password || !admin?.first_name || !admin?.last_name) {
      return res.status(400).json({ success: false, message: 'Informations administrateur incomplètes' });
    }
    if (admin.password.length < 8) {
      return res.status(400).json({ success: false, message: 'Mot de passe trop court (min. 8 caractères)' });
    }

    const [existing] = await db.execute('SELECT id FROM users WHERE email = ?', [admin.email]);
    if (existing.length) {
      return res.status(409).json({ success: false, message: 'Un compte avec cet email existe déjà' });
    }

    const [schoolResult] = await db.execute(
      'INSERT INTO schools (name, address, phone, email, trial_ends_at) VALUES (?, ?, ?, ?, DATE_ADD(NOW(), INTERVAL ? DAY))',
      [school.name, school.address || null, school.phone || null, school.email || admin.email, TRIAL_DAYS]
    );
    const schoolId = schoolResult.insertId;

    const hash = await bcrypt.hash(admin.password, 10);
    await db.execute(
      'INSERT INTO users (school_id, first_name, last_name, email, password, role) VALUES (?, ?, ?, ?, ?, ?)',
      [schoolId, admin.first_name, admin.last_name, admin.email, hash, 'director']
    );

    logActivity({
      schoolId, userName: `${admin.first_name} ${admin.last_name}`, userRole: 'director',
      action: 'create', entityType: 'school', entityId: schoolId, description: `Nouvelle école inscrite : ${school.name}`,
    });

    res.status(201).json({
      success: true,
      message: `École et compte créés avec succès. Vous bénéficiez de ${TRIAL_DAYS} jours d'essai gratuit.`,
      trial_days: TRIAL_DAYS,
    });
  } catch (err) {
    handleError(res, err);
  }
};

exports.logout = async (req, res) => {
  try {
    // La session est révoquée côté serveur : le JWT ne peut plus servir, même s'il a été copié.
    await revokeSession(req.session);
    clearSession(res);
    logActivity({
      schoolId: req.user.school_id, userId: req.user.id, userName: `${req.user.first_name} ${req.user.last_name}`, userRole: req.user.role,
      action: 'logout', entityType: 'auth', description: 'Déconnexion', ip: req.ip,
    });
    res.json({ success: true, message: 'Déconnexion réussie' });
  } catch (err) {
    handleError(res, err);
  }
};

exports.me = async (req, res) => {
  try {
    const [users] = await db.execute(
      `SELECT u.id, u.school_id, u.first_name, u.last_name, u.email, u.role, u.phone, u.avatar_url, u.must_change_password, u.totp_enabled,
              s.name as school_name, s.primary_color, s.secondary_color, s.logo_url as school_logo, s.address as school_address,
              s.trial_ends_at, s.subscription_paid_until
       FROM users u
       LEFT JOIN schools s ON u.school_id = s.id
       WHERE u.id = ?`,
      [req.user.id]
    );
    const user = users[0];
    const subscription = user?.school_id ? getSubscriptionState(user) : null;
    if (user) { delete user.trial_ends_at; delete user.subscription_paid_until; }
    res.json({ success: true, user: user ? { ...user, subscription } : user });
  } catch (err) {
    handleError(res, err);
  }
};

exports.updateProfile = async (req, res) => {
  try {
    const { first_name, last_name, phone } = req.body;
    await db.execute(
      'UPDATE users SET first_name = ?, last_name = ?, phone = ? WHERE id = ?',
      [first_name, last_name, phone, req.user.id]
    );
    res.json({ success: true, message: 'Profil mis à jour' });
  } catch (err) {
    handleError(res, err);
  }
};

// Compare deux numéros en ignorant espaces, tirets et indicatif (+225 / 00225) : on garde les 10 derniers chiffres.
const phoneKey = (p) => String(p || '').replace(/\D/g, '').slice(-10);

// Mot de passe oublié : aucun service email n'est branché, le mot de passe temporaire est donc
// renvoyé directement à l'écran. Pour éviter que quiconque connaissant un email puisse prendre
// le compte, on exige aussi le téléphone enregistré sur ce compte.
exports.forgotPassword = async (req, res) => {
  try {
    const { email, phone } = req.body;
    const genericError = { success: false, message: "Aucun compte actif ne correspond à cet email et ce numéro. Contactez l'administrateur de votre école." };

    const [users] = await db.execute(
      'SELECT id, school_id, first_name, last_name, role, phone FROM users WHERE email = ? AND is_active = 1',
      [email]
    );
    const user = users[0];

    // Le compte super admin a accès à toutes les écoles : il ne peut pas être réinitialisé
    // avec un simple numéro de téléphone (passer par create_super_admin.js sur le serveur).
    if (user?.role === 'super_admin') return res.status(400).json(genericError);

    // Limite par compte (en plus de la limite par adresse IP dans app.js) : empêche de tester
    // des numéros depuis plusieurs adresses, et de réinitialiser en boucle le compte de quelqu'un.
    if (user) {
      const [[{ attempts }]] = await db.execute(
        `SELECT COUNT(*) as attempts FROM activity_logs
         WHERE user_id = ? AND action IN ('password_reset', 'password_reset_failed') AND created_at > DATE_SUB(NOW(), INTERVAL 1 DAY)`,
        [user.id]
      );
      if (attempts >= MAX_RESETS_PER_DAY) {
        return res.status(429).json({ success: false, message: "Trop de demandes pour ce compte aujourd'hui. Réessayez demain ou contactez l'administrateur de votre école." });
      }
    }

    if (!user || !phoneKey(user.phone) || phoneKey(user.phone) !== phoneKey(phone)) {
      logActivity({
        schoolId: user?.school_id, userId: user?.id, action: 'password_reset_failed', entityType: 'auth',
        description: `Réinitialisation refusée : ${email}`, ip: req.ip,
      });
      return res.status(400).json(genericError);
    }

    const tempPassword = generateTempPassword();
    const hash = await bcrypt.hash(tempPassword, 10);
    await db.execute('UPDATE users SET password = ? WHERE id = ?', [hash, user.id]);
    // Toutes les sessions ouvertes sur ce compte sont fermées
    await revokeAllSessions(user.id);
    logActivity({
      schoolId: user.school_id, userId: user.id, userName: `${user.first_name} ${user.last_name}`, userRole: user.role,
      action: 'password_reset', entityType: 'auth', description: 'Mot de passe réinitialisé (mot de passe oublié)', ip: req.ip,
    });
    res.json({ success: true, temp_password: tempPassword });
  } catch (err) {
    handleError(res, err);
  }
};

exports.changePassword = async (req, res) => {
  try {
    const { current_password, new_password } = req.body;
    const [users] = await db.execute('SELECT password FROM users WHERE id = ?', [req.user.id]);
    const valid = await bcrypt.compare(current_password, users[0].password);
    if (!valid) {
      return res.status(400).json({ success: false, message: 'Mot de passe actuel incorrect' });
    }
    if (!new_password || new_password.length < 8) {
      return res.status(400).json({ success: false, message: 'Le nouveau mot de passe doit contenir au moins 8 caractères' });
    }
    const hash = await bcrypt.hash(new_password, 10);
    await db.execute('UPDATE users SET password = ?, must_change_password = 0 WHERE id = ?', [hash, req.user.id]);
    // Ferme les sessions ouvertes ailleurs, puis rouvre une session pour l'appareil actuel
    const tokenVersion = await revokeAllSessions(req.user.id);
    await revokeSession(req.session);
    const token = issueSession(res, { ...req.user, token_version: tokenVersion });
    logActivity({
      schoolId: req.user.school_id, userId: req.user.id, userName: `${req.user.first_name} ${req.user.last_name}`, userRole: req.user.role,
      action: 'password_change', entityType: 'auth', description: 'Mot de passe modifié', ip: req.ip,
    });
    res.json({ success: true, message: 'Mot de passe modifié', token });
  } catch (err) {
    handleError(res, err);
  }
};
