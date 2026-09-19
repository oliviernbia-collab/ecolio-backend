const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const db = require('../config/database');
const { handleError } = require('../utils/errors');
const { logActivity } = require('../services/activityLog');
const { getSubscriptionState, TRIAL_DAYS } = require('../services/subscription');

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

    await db.execute('UPDATE users SET last_login = NOW() WHERE id = ?', [user.id]);
    logActivity({
      schoolId: user.school_id, userId: user.id, userName: `${user.first_name} ${user.last_name}`, userRole: user.role,
      action: 'login', entityType: 'auth', description: 'Connexion réussie', ip: req.ip,
    });

    const token = jwt.sign(
      { id: user.id, role: user.role, school_id: user.school_id },
      process.env.JWT_SECRET,
      { expiresIn: process.env.JWT_EXPIRES_IN || '7d' }
    );

    const subscription = user.school_id ? getSubscriptionState(user) : null;
    delete user.password;
    delete user.trial_ends_at;
    delete user.subscription_paid_until;
    res.json({ success: true, token, user: { ...user, subscription } });
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
  logActivity({
    schoolId: req.user.school_id, userId: req.user.id, userName: `${req.user.first_name} ${req.user.last_name}`, userRole: req.user.role,
    action: 'logout', entityType: 'auth', description: 'Déconnexion', ip: req.ip,
  });
  res.json({ success: true, message: 'Déconnexion réussie' });
};

exports.me = async (req, res) => {
  try {
    const [users] = await db.execute(
      `SELECT u.id, u.school_id, u.first_name, u.last_name, u.email, u.role, u.phone, u.avatar_url, u.must_change_password,
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
    logActivity({
      schoolId: req.user.school_id, userId: req.user.id, userName: `${req.user.first_name} ${req.user.last_name}`, userRole: req.user.role,
      action: 'password_change', entityType: 'auth', description: 'Mot de passe modifié', ip: req.ip,
    });
    res.json({ success: true, message: 'Mot de passe modifié' });
  } catch (err) {
    handleError(res, err);
  }
};
