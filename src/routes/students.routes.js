const router = require('express').Router();
const { authenticate, requirePermission } = require('../middleware/auth');
const { auditLog } = require('../services/activityLog');
const ctrl = require('../controllers/students.controller');

router.get('/parents', authenticate, requirePermission('students.read'), ctrl.getParents);
router.get('/export/excel', authenticate, requirePermission('students.read'), ctrl.exportExcel);
router.post('/parents/:id/reset-password', authenticate, requirePermission('students.write'),
  auditLog('password_reset', 'auth', req => `Mot de passe d'un parent réinitialisé par l'école (compte n°${req.params.id})`), ctrl.resetParentPassword);
router.get('/', authenticate, requirePermission('students.read'), ctrl.getAll);
router.get('/:id', authenticate, requirePermission('students.read'), ctrl.getOne);
router.post('/', authenticate, requirePermission('students.write'),
  auditLog('create', 'student', req => `Élève créé : ${req.body.first_name} ${req.body.last_name}`), ctrl.create);
router.post('/:id/reset-password', authenticate, requirePermission('students.write'),
  auditLog('password_reset', 'auth', req => `Mot de passe du compte ${req.body.account === 'parent' ? 'parent' : 'élève'} réinitialisé par l'école (élève n°${req.params.id})`),
  ctrl.resetAccountPassword);
router.put('/:id', authenticate, requirePermission('students.write'),
  auditLog('update', 'student', req => `Élève modifié : ${req.body.first_name} ${req.body.last_name}`), ctrl.update);
router.delete('/:id', authenticate, requirePermission('students.delete'),
  auditLog('delete', 'student', () => 'Élève archivé'), ctrl.delete);

module.exports = router;
