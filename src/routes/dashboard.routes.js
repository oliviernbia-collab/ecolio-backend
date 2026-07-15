const router = require('express').Router();
const { authenticate } = require('../middleware/auth');
const ctrl = require('../controllers/dashboard.controller');

router.get('/', authenticate, ctrl.getStats);

module.exports = router;
