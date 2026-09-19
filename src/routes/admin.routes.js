const router = require('express').Router();
const { authenticate, authorize } = require('../middleware/auth');
const ctrl = require('../controllers/admin.controller');
const activityLogCtrl = require('../controllers/activityLog.controller');

// Panneau plateforme : rôle super_admin uniquement, vue transversale multi-écoles
router.get('/schools',            authenticate, authorize('super_admin'), ctrl.getSchools);
router.get('/stats',              authenticate, authorize('super_admin'), ctrl.getStats);
router.put('/schools/:id/status', authenticate, authorize('super_admin'), ctrl.setSchoolStatus);
router.get('/activity-logs',      authenticate, authorize('super_admin'), activityLogCtrl.getPlatformLog);
router.get('/users',              authenticate, authorize('super_admin'), ctrl.getUsers);

router.get('/subscription-payments',            authenticate, authorize('super_admin'), ctrl.getSubscriptionPayments);
router.put('/subscription-payments/:id/approve',authenticate, authorize('super_admin'), ctrl.approveSubscriptionPayment);
router.put('/subscription-payments/:id/reject', authenticate, authorize('super_admin'), ctrl.rejectSubscriptionPayment);

module.exports = router;
