const router = require('express').Router();
const { body } = require('express-validator');
const { authenticate, requirePermission } = require('../middleware/auth');
const { validate } = require('../middleware/validate');
const ctrl = require('../controllers/finance.controller');

router.get('/', authenticate, requirePermission('finance.read'), ctrl.getAll);
router.get('/stats', authenticate, requirePermission('finance.read'), ctrl.getStats);
router.get('/export/excel', authenticate, requirePermission('finance.read'), ctrl.exportExcel);
router.get('/:id', authenticate, requirePermission('finance.read'), ctrl.getOne);
router.post('/', authenticate, requirePermission('finance.write'), validate([
  body('student_id').isInt({ min: 1 }).withMessage('Élève invalide'),
  body('amount').isFloat({ gt: 0 }).withMessage('Montant invalide'),
]), ctrl.create);
router.put('/:id/pay',    authenticate, requirePermission('finance.pay'), ctrl.markPaid);
router.patch('/:id/pay',  authenticate, requirePermission('finance.pay'), ctrl.markPaid);
router.put('/:id/cancel', authenticate, requirePermission('finance.write'), ctrl.cancel);
router.put('/:id',        authenticate, requirePermission('finance.write'), ctrl.update);

module.exports = router;
