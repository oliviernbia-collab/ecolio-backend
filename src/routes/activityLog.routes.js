const router = require('express').Router();
const { authenticate, requirePermission } = require('../middleware/auth');
const ctrl = require('../controllers/activityLog.controller');

router.get('/', authenticate, requirePermission('activity_logs.view'), ctrl.getSchoolLog);

module.exports = router;
