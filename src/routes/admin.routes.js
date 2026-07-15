const router = require('express').Router();
const { authenticate, authorize } = require('../middleware/auth');
const ctrl = require('../controllers/admin.controller');

// Panneau plateforme : rôle super_admin uniquement, vue transversale multi-écoles
router.get('/schools',            authenticate, authorize('super_admin'), ctrl.getSchools);
router.get('/stats',              authenticate, authorize('super_admin'), ctrl.getStats);
router.put('/schools/:id/status', authenticate, authorize('super_admin'), ctrl.setSchoolStatus);

module.exports = router;
