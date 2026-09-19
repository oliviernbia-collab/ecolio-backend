const router = require('express').Router();
const { authenticate, requirePermission } = require('../middleware/auth');
const { auditLog } = require('../services/activityLog');
const ctrl = require('../controllers/payroll.controller');

router.get('/stats',    authenticate, requirePermission('payroll.read'), ctrl.getStats);
router.get('/',         authenticate, requirePermission('payroll.read'), ctrl.getAll);
router.get('/:id',      authenticate, requirePermission('payroll.read'), ctrl.getOne);
router.get('/:id/pdf',  authenticate, requirePermission('payroll.read'), ctrl.getPdf);
router.post('/generate',authenticate, requirePermission('payroll.write'),
  auditLog('create', 'payroll', req => `Bulletins de paye générés (${req.body.month || ''})`), ctrl.generate);
router.put('/:id',      authenticate, requirePermission('payroll.write'), auditLog('update', 'payroll', () => 'Bulletin de paye modifié'), ctrl.update);
router.put('/:id/pay',  authenticate, requirePermission('payroll.pay'), auditLog('pay', 'payroll', () => 'Bulletin de paye marqué payé'), ctrl.markPaid);
router.delete('/:id',   authenticate, requirePermission('payroll.write'), auditLog('delete', 'payroll', () => 'Bulletin de paye supprimé'), ctrl.remove);

module.exports = router;
