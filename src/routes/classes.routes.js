const router = require('express').Router();
const { authenticate, requirePermission } = require('../middleware/auth');
const ctrl = require('../controllers/classes.controller');

router.get('/', authenticate, ctrl.getAll);
router.get('/:id', authenticate, ctrl.getOne);
router.get('/:id/students', authenticate, ctrl.getStudents);
router.post('/', authenticate, requirePermission('classes.write'), ctrl.create);
router.put('/:id', authenticate, requirePermission('classes.write'), ctrl.update);
router.delete('/:id', authenticate, requirePermission('classes.write'), ctrl.delete);

module.exports = router;
