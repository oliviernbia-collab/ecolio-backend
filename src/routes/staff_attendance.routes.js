const router = require('express').Router();
const { authenticate, requirePermission } = require('../middleware/auth');
const ctrl = require('../controllers/staff_attendance.controller');

router.get('/mine',     authenticate, ctrl.getMine);
router.post('/checkin', authenticate, ctrl.checkIn);
router.put('/checkout', authenticate, ctrl.checkOut);

router.get('/',      authenticate, requirePermission('staff_attendance.read'), ctrl.getByDate);
router.get('/stats',  authenticate, requirePermission('staff_attendance.read'), ctrl.getStats);
router.post('/bulk',  authenticate, requirePermission('staff_attendance.write'), ctrl.bulkRecord);

module.exports = router;
