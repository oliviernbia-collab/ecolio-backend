const router = require('express').Router();
const { authenticate, requirePermission } = require('../middleware/auth');
const upload = require('../middleware/upload');
const ctrl = require('../controllers/subscription.controller');

router.get('/status', authenticate, ctrl.getStatus);

router.post(
  '/payments',
  authenticate,
  requirePermission('subscription.manage'),
  upload.single('proof'),
  ctrl.submitPayment
);

module.exports = router;
