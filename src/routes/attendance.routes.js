const router = require('express').Router();
const { authenticate, requirePermission } = require('../middleware/auth');
const ctrl = require('../controllers/attendance.controller');

router.get('/', authenticate, ctrl.getAll);
router.get('/class/:classId', authenticate, ctrl.getByClass);
router.get('/student/:studentId', authenticate, ctrl.getByStudent);
router.post('/', authenticate, requirePermission('attendance.write'), ctrl.record);
router.post('/bulk', authenticate, requirePermission('attendance.write'), ctrl.bulkRecord);
router.put('/:id/justify', authenticate, ctrl.justify);

module.exports = router;
