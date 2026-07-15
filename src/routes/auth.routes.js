const router = require('express').Router();
const { body } = require('express-validator');
const { authenticate } = require('../middleware/auth');
const { validate } = require('../middleware/validate');
const ctrl = require('../controllers/auth.controller');

router.post('/login', validate([
  body('email').trim().isEmail().withMessage('Email invalide').normalizeEmail(),
  body('password').notEmpty().withMessage('Mot de passe requis'),
]), ctrl.login);

router.post('/register', validate([
  body('school.name').trim().notEmpty().withMessage("Le nom de l'école est requis"),
  body('admin.email').trim().isEmail().withMessage('Email administrateur invalide').normalizeEmail(),
  body('admin.password').isLength({ min: 8 }).withMessage('Mot de passe trop court (min. 8 caractères)'),
  body('admin.first_name').trim().notEmpty().withMessage('Prénom administrateur requis'),
  body('admin.last_name').trim().notEmpty().withMessage('Nom administrateur requis'),
]), ctrl.register);

router.post('/logout', authenticate, ctrl.logout);
router.get('/me', authenticate, ctrl.me);
router.put('/me', authenticate, ctrl.updateProfile);
router.put('/change-password', authenticate, validate([
  body('current_password').notEmpty().withMessage('Mot de passe actuel requis'),
  body('new_password').isLength({ min: 8 }).withMessage('Le nouveau mot de passe doit contenir au moins 8 caractères'),
]), ctrl.changePassword);

module.exports = router;
