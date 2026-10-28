const { readSession, SessionError } = require('../utils/session');
const { userHasPermission } = require('../services/permissions');
const { getSubscriptionState } = require('../services/subscription');

// Routes toujours accessibles même abonnement expiré : connexion/déconnexion/profil,
// et la gestion de l'abonnement elle-même (sinon impossible de payer pour se débloquer),
// ainsi que le contact avec le support Écolio.
const ALLOWED_WHEN_EXPIRED = ['/api/auth', '/api/subscription', '/api/contact'];

const authenticate = async (req, res, next) => {
  let session;
  try {
    session = await readSession(req, { userColumns: 'u.id, u.school_id, u.role, u.first_name, u.last_name, u.email' });
  } catch (err) {
    if (err instanceof SessionError) return res.status(err.status).json({ success: false, message: err.message });
    return next(err);
  }
  if (!session) {
    return res.status(401).json({ success: false, message: 'Authentification requise' });
  }
  const user = session.user;
  if (user.school_id && user.school_is_active === 0) {
    return res.status(403).json({ success: false, message: 'Cette école a été suspendue. Contactez le support Écolio.' });
  }

  if (user.school_id) {
    const subscription = getSubscriptionState(user);
    req.subscription = subscription;
    const whitelisted = ALLOWED_WHEN_EXPIRED.some(p => req.baseUrl.startsWith(p));
    if (!subscription.active && !whitelisted) {
      return res.status(402).json({
        success: false,
        code: 'SUBSCRIPTION_EXPIRED',
        message: "Votre période d'essai est terminée. Merci de régulariser votre abonnement pour continuer.",
      });
    }
  }

  delete user.school_is_active;
  delete user.trial_ends_at;
  delete user.subscription_paid_until;
  req.user = user;
  req.session = session.decoded;
  next();
};

const authorize = (...roles) => {
  return (req, res, next) => {
    if (!roles.includes(req.user.role)) {
      return res.status(403).json({ success: false, message: 'Accès non autorisé pour ce rôle' });
    }
    next();
  };
};

// RBAC réel : autorise si l'utilisateur possède la permission demandée — celles de son rôle
// (role_permissions), ajustées individuellement par le directeur (user_permissions).
const requirePermission = (permissionCode) => {
  return async (req, res, next) => {
    try {
      const allowed = await userHasPermission(req.user, permissionCode);
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
