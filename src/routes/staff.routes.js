const router = require('express').Router();
const { authenticate, requirePermission } = require('../middleware/auth');
const { auditLog } = require('../services/activityLog');
const ctrl = require('../controllers/staff.controller');

router.get('/', authenticate, requirePermission('staff.read'), ctrl.getAll);
router.get('/:id', authenticate, requirePermission('staff.read'), ctrl.getOne);
router.post('/', authenticate, requirePermission('staff.write'),
  auditLog('create', 'staff', req => `Membre du personnel créé : ${req.body.first_name} ${req.body.last_name}`), ctrl.create);
router.put('/:id', authenticate, requirePermission('staff.write'),
  auditLog('update', 'staff', req => `Membre du personnel modifié : ${req.body.first_name} ${req.body.last_name}`), ctrl.update);
router.delete('/:id', authenticate, requirePermission('staff.write'),
  auditLog('delete', 'staff', () => 'Membre du personnel supprimé'), ctrl.remove);

module.exports = router;
