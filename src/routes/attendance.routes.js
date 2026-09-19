const router = require('express').Router();
const { authenticate, requirePermission } = require('../middleware/auth');
const ctrl = require('../controllers/attendance.controller');

router.get('/', authenticate, requirePermission('attendance.read'), ctrl.getAll);
router.get('/class/:classId', authenticate, requirePermission('attendance.read'), ctrl.getByClass);
router.get('/student/:studentId', authenticate, requirePermission('attendance.read'), ctrl.getByStudent);
router.post('/', authenticate, requirePermission('attendance.write'), ctrl.record);
router.post('/bulk', authenticate, requirePermission('attendance.write'), ctrl.bulkRecord);
router.put('/:id/justify', authenticate, requirePermission('attendance.write'), ctrl.justify);

module.exports = router;
