const router = require('express').Router();
const { authenticate, requirePermission } = require('../middleware/auth');
const { auditLog } = require('../services/activityLog');
const ctrl = require('../controllers/classes.controller');

router.get('/', authenticate, ctrl.getAll);
router.get('/:id', authenticate, ctrl.getOne);
router.get('/:id/students', authenticate, ctrl.getStudents);
router.post('/', authenticate, requirePermission('classes.write'),
  auditLog('create', 'class', req => `Classe créée : ${req.body.name || ''}`), ctrl.create);
router.put('/:id', authenticate, requirePermission('classes.write'),
  auditLog('update', 'class', req => `Classe modifiée : ${req.body.name || ''}`), ctrl.update);
router.delete('/:id', authenticate, requirePermission('classes.write'),
  auditLog('delete', 'class', () => 'Classe supprimée'), ctrl.delete);

module.exports = router;
