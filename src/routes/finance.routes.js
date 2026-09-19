const router = require('express').Router();
const { body } = require('express-validator');
const { authenticate, requirePermission } = require('../middleware/auth');
const { validate } = require('../middleware/validate');
const { auditLog } = require('../services/activityLog');
const ctrl = require('../controllers/finance.controller');

router.get('/', authenticate, requirePermission('finance.read'), ctrl.getAll);
router.get('/stats', authenticate, requirePermission('finance.read'), ctrl.getStats);
router.get('/export/excel', authenticate, requirePermission('finance.read'), ctrl.exportExcel);
router.get('/:id', authenticate, requirePermission('finance.read'), ctrl.getOne);
router.post('/', authenticate, requirePermission('finance.write'), validate([
  body('student_id').isInt({ min: 1 }).withMessage('Élève invalide'),
  body('amount').isFloat({ gt: 0 }).withMessage('Montant invalide'),
]), auditLog('create', 'invoice', req => `Facture créée : ${req.body.amount} FCFA (élève #${req.body.student_id})`), ctrl.create);
router.put('/:id/pay',    authenticate, requirePermission('finance.pay'), auditLog('pay', 'invoice', () => 'Facture marquée payée'), ctrl.markPaid);
router.patch('/:id/pay',  authenticate, requirePermission('finance.pay'), auditLog('pay', 'invoice', () => 'Facture marquée payée'), ctrl.markPaid);
router.put('/:id/cancel', authenticate, requirePermission('finance.write'), auditLog('cancel', 'invoice', () => 'Facture annulée'), ctrl.cancel);
router.put('/:id',        authenticate, requirePermission('finance.write'), auditLog('update', 'invoice', () => 'Facture modifiée'), ctrl.update);

module.exports = router;
