const router = require('express').Router();
const { authenticate, requirePermission } = require('../middleware/auth');
const ctrl = require('../controllers/services.controller');

router.get('/',        authenticate, requirePermission('services.read'),  ctrl.getServices);
router.post('/',       authenticate, requirePermission('services.write'), ctrl.createService);
router.put('/:id',     authenticate, requirePermission('services.write'), ctrl.updateService);
router.delete('/:id',  authenticate, requirePermission('services.write'), ctrl.deleteService);

router.get('/subscriptions',      authenticate, requirePermission('services.read'),  ctrl.getSubscriptions);
router.post('/subscriptions',     authenticate, requirePermission('services.write'), ctrl.createSubscription);
router.put('/subscriptions/:id',  authenticate, requirePermission('services.write'), ctrl.updateSubscriptionStatus);

module.exports = router;
