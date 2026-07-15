const router = require('express').Router();
const { authenticate } = require('../middleware/auth');
const ctrl = require('../controllers/notifications.controller');

router.get('/', authenticate, ctrl.getAll);
router.put('/:id/read', authenticate, ctrl.markRead);
router.put('/read-all', authenticate, ctrl.markAllRead);

module.exports = router;
