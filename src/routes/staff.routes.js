const router = require('express').Router();
const { authenticate, requirePermission } = require('../middleware/auth');
const ctrl = require('../controllers/staff.controller');

router.get('/', authenticate, requirePermission('staff.read'), ctrl.getAll);
router.get('/:id', authenticate, requirePermission('staff.read'), ctrl.getOne);
router.post('/', authenticate, requirePermission('staff.write'), ctrl.create);
router.put('/:id', authenticate, requirePermission('staff.write'), ctrl.update);
router.delete('/:id', authenticate, requirePermission('staff.write'), ctrl.remove);

module.exports = router;
