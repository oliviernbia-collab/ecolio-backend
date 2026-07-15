const router = require('express').Router();
const { authenticate, requirePermission } = require('../middleware/auth');
const ctrl = require('../controllers/payroll.controller');

router.get('/stats',    authenticate, requirePermission('payroll.read'), ctrl.getStats);
router.get('/',         authenticate, requirePermission('payroll.read'), ctrl.getAll);
router.get('/:id',      authenticate, requirePermission('payroll.read'), ctrl.getOne);
router.get('/:id/pdf',  authenticate, requirePermission('payroll.read'), ctrl.getPdf);
router.post('/generate',authenticate, requirePermission('payroll.write'), ctrl.generate);
router.put('/:id',      authenticate, requirePermission('payroll.write'), ctrl.update);
router.put('/:id/pay',  authenticate, requirePermission('payroll.pay'), ctrl.markPaid);
router.delete('/:id',   authenticate, requirePermission('payroll.write'), ctrl.remove);

module.exports = router;
