const router = require('express').Router();
const { authenticate, requirePermission } = require('../middleware/auth');
const ctrl = require('../controllers/health.controller');

router.get('/',        authenticate, requirePermission('health.read'),  ctrl.getAll);
router.post('/',       authenticate, requirePermission('health.write'), ctrl.create);
router.put('/:id',     authenticate, requirePermission('health.write'), ctrl.update);
router.delete('/:id',  authenticate, requirePermission('health.write'), ctrl.remove);

module.exports = router;
