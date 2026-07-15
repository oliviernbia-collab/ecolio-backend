const router = require('express').Router();
const { authenticate, requirePermission } = require('../middleware/auth');
const ctrl = require('../controllers/schedule.controller');

router.get('/', authenticate, ctrl.getAll);
router.get('/class/:classId', authenticate, ctrl.getByClass);
router.get('/teacher/:teacherId', authenticate, ctrl.getByTeacher);
router.post('/', authenticate, requirePermission('schedule.write'), ctrl.create);
router.put('/:id', authenticate, requirePermission('schedule.write'), ctrl.update);
router.delete('/:id', authenticate, requirePermission('schedule.write'), ctrl.delete);

module.exports = router;
