const router = require('express').Router();
const { authenticate, requirePermission } = require('../middleware/auth');
const ctrl = require('../controllers/subjects.controller');

router.get('/', authenticate, ctrl.getAll);
router.post('/', authenticate, requirePermission('subjects.write'), ctrl.create);
router.put('/:id', authenticate, requirePermission('subjects.write'), ctrl.update);
router.delete('/:id', authenticate, requirePermission('subjects.write'), ctrl.delete);

module.exports = router;
