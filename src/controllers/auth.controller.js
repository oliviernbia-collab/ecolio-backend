const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const db = require('../config/database');
const { handleError } = require('../utils/errors');

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
      `SELECT u.*, s.name as school_name, s.primary_color, s.secondary_color, s.logo_url as school_logo, s.is_active as school_is_active
       FROM users u
       LEFT JOIN schools s ON u.school_id = s.id
       WHERE u.email = ? AND u.is_active = 1`,
      [email]
    );

    if (!users.length) {
      return res.status(401).json({ success: false, message: 'Email ou mot de passe incorrect' });
    }

    const user = users[0];
    const valid = await bcrypt.compare(password, user.password);
    if (!valid) {
      return res.status(401).json({ success: false, message: 'Email ou mot de passe incorrect' });
    }

    if (user.school_id && user.school_is_active === 0) {
      return res.status(403).json({ success: false, message: 'Cette école a été suspendue. Contactez le support Écolio.' });
    }
    delete user.school_is_active;

    await db.execute('UPDATE users SET last_login = NOW() WHERE id = ?', [user.id]);

    const token = jwt.sign(
      { id: user.id, role: user.role, school_id: user.school_id },
      process.env.JWT_SECRET,
      { expiresIn: process.env.JWT_EXPIRES_IN || '7d' }
    );

    delete user.password;
    res.json({ success: true, token, user });
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
      'INSERT INTO schools (name, address, phone, email) VALUES (?, ?, ?, ?)',
      [school.name, school.address || null, school.phone || null, school.email || admin.email]
    );
    const schoolId = schoolResult.insertId;

    const hash = await bcrypt.hash(admin.password, 10);
    await db.execute(
      'INSERT INTO users (school_id, first_name, last_name, email, password, role) VALUES (?, ?, ?, ?, ?, ?)',
      [schoolId, admin.first_name, admin.last_name, admin.email, hash, 'director']
    );

    res.status(201).json({ success: true, message: 'École et compte créés avec succès' });
  } catch (err) {
    handleError(res, err);
  }
};

exports.logout = async (req, res) => {
  res.json({ success: true, message: 'Déconnexion réussie' });
};

exports.me = async (req, res) => {
  try {
    const [users] = await db.execute(
      `SELECT u.id, u.school_id, u.first_name, u.last_name, u.email, u.role, u.phone, u.avatar_url, u.must_change_password,
              s.name as school_name, s.primary_color, s.secondary_color, s.logo_url as school_logo, s.address as school_address
       FROM users u
       LEFT JOIN schools s ON u.school_id = s.id
       WHERE u.id = ?`,
      [req.user.id]
    );
    res.json({ success: true, user: users[0] });
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
    res.json({ success: true, message: 'Mot de passe modifié' });
  } catch (err) {
    handleError(res, err);
  }
};
