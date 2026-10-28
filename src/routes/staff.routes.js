const router = require('express').Router();
const { authenticate, authorize, requirePermission } = require('../middleware/auth');
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

// Permissions individuelles : réservées au directeur, jamais délégables (sinon escalade de droits)
router.get('/:id/permissions', authenticate, authorize('director'), ctrl.getPermissions);
router.put('/:id/permissions', authenticate, authorize('director'),
  auditLog('update', 'staff', (req, body) => `Permissions modifiées : ${body.name} (${body.overrides} écart(s) par rapport au rôle)`),
  ctrl.updatePermissions);

module.exports = router;
