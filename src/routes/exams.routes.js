const router = require('express').Router();
const { authenticate, requirePermission } = require('../middleware/auth');
const ctrl = require('../controllers/exams.controller');

router.get('/',    authenticate, ctrl.getAll);
router.get('/:id', authenticate, ctrl.getOne);
router.post('/',   authenticate, requirePermission('exams.write'), ctrl.create);
router.put('/:id',    authenticate, requirePermission('exams.write'), ctrl.update);
router.delete('/:id', authenticate, requirePermission('exams.write'), ctrl.remove);
router.post('/:id/supervisors',              authenticate, requirePermission('exams.write'), ctrl.addSupervisor);
router.delete('/:id/supervisors/:teacherId',  authenticate, requirePermission('exams.write'), ctrl.removeSupervisor);
router.post('/:id/grades', authenticate, requirePermission('exams.write'), ctrl.recordGrades);

module.exports = router;
