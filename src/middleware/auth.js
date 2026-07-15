const jwt = require('jsonwebtoken');
const db = require('../config/database');
const { roleHasPermission } = require('../services/permissions');

const authenticate = async (req, res, next) => {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ success: false, message: 'Token d\'authentification manquant' });
  }
  const token = authHeader.split(' ')[1];
  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    const [users] = await db.execute(
      `SELECT u.id, u.school_id, u.role, u.first_name, u.last_name, u.email, s.is_active as school_is_active
       FROM users u LEFT JOIN schools s ON u.school_id = s.id
       WHERE u.id = ? AND u.is_active = 1`,
      [decoded.id]
    );
    if (!users.length) {
      return res.status(401).json({ success: false, message: 'Utilisateur non trouvé ou désactivé' });
    }
    if (users[0].school_id && users[0].school_is_active === 0) {
      return res.status(403).json({ success: false, message: 'Cette école a été suspendue. Contactez le support Écolio.' });
    }
    delete users[0].school_is_active;
    req.user = users[0];
    next();
  } catch (err) {
    return res.status(401).json({ success: false, message: 'Token invalide ou expiré' });
  }
};

const authorize = (...roles) => {
  return (req, res, next) => {
    if (!roles.includes(req.user.role)) {
      return res.status(403).json({ success: false, message: 'Accès non autorisé pour ce rôle' });
    }
    next();
  };
};

// RBAC réel : autorise si le rôle de l'utilisateur possède la permission demandée
// dans la table role_permissions (au lieu d'un tableau de rôles codé en dur).
const requirePermission = (permissionCode) => {
  return async (req, res, next) => {
    try {
      const allowed = await roleHasPermission(req.user.role, permissionCode);
      if (!allowed) {
        return res.status(403).json({ success: false, message: 'Accès non autorisé pour ce rôle' });
      }
      next();
    } catch (err) {
      next(err);
    }
  };
};

module.exports = { authenticate, authorize, requirePermission };
