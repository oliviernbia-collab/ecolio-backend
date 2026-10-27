const router = require('express').Router();
const { body } = require('express-validator');
const { authenticate } = require('../middleware/auth');
const { validate } = require('../middleware/validate');
const ctrl = require('../controllers/auth.controller');
const twoFactor = require('../controllers/twoFactor.controller');

router.post('/login', validate([
  body('email').trim().isEmail().withMessage('Email invalide').normalizeEmail(),
  body('password').notEmpty().withMessage('Mot de passe requis'),
]), ctrl.login);

// Deuxième étape de connexion quand la double authentification est activée
router.post('/login/2fa', validate([
  body('challenge_token').notEmpty().withMessage('Jeton manquant'),
  body('code').trim().notEmpty().withMessage('Code requis'),
]), ctrl.loginTwoFactor);

router.post('/register', validate([
  body('school.name').trim().notEmpty().withMessage("Le nom de l'école est requis"),
  body('admin.email').trim().isEmail().withMessage('Email administrateur invalide').normalizeEmail(),
  body('admin.password').isLength({ min: 8 }).withMessage('Mot de passe trop court (min. 8 caractères)'),
  body('admin.first_name').trim().notEmpty().withMessage('Prénom administrateur requis'),
  body('admin.last_name').trim().notEmpty().withMessage('Nom administrateur requis'),
]), ctrl.register);

router.post('/forgot-password', validate([
  body('email').trim().isEmail().withMessage('Email invalide').normalizeEmail(),
  body('phone').trim().notEmpty().withMessage('Numéro de téléphone requis'),
]), ctrl.forgotPassword);

router.post('/logout', authenticate, ctrl.logout);
router.get('/me', authenticate, ctrl.me);
router.put('/me', authenticate, ctrl.updateProfile);
router.put('/change-password', authenticate, validate([
  body('current_password').notEmpty().withMessage('Mot de passe actuel requis'),
  body('new_password').isLength({ min: 8 }).withMessage('Le nouveau mot de passe doit contenir au moins 8 caractères'),
]), ctrl.changePassword);

// Double authentification (Paramètres > Mot de passe)
router.get('/2fa', authenticate, twoFactor.status);
router.post('/2fa/setup', authenticate, twoFactor.setup);
router.post('/2fa/enable', authenticate, twoFactor.enable);
router.post('/2fa/disable', authenticate, twoFactor.disable);
router.post('/2fa/recovery-codes', authenticate, twoFactor.regenerateRecoveryCodes);

module.exports = router;
