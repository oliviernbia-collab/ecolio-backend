const router = require('express').Router();
const { authenticate, requirePermission } = require('../middleware/auth');
const ctrl = require('../controllers/schools.controller');

router.get('/', authenticate, ctrl.getSchool);
router.put('/', authenticate, requirePermission('settings.write'), ctrl.updateSchool);

module.exports = router;
