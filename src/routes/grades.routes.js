const router = require('express').Router();
const { body } = require('express-validator');
const { authenticate, requirePermission } = require('../middleware/auth');
const { validate } = require('../middleware/validate');
const { auditLog } = require('../services/activityLog');
const ctrl = require('../controllers/grades.controller');

const gradeRules = [
  body('student_id').isInt({ min: 1 }).withMessage('Élève invalide'),
  body('subject_id').isInt({ min: 1 }).withMessage('Matière invalide'),
  body('value').isFloat({ min: 0 }).withMessage('Note invalide'),
  body('max_value').optional().isFloat({ min: 1 }).withMessage('Barème invalide'),
];

router.get('/', authenticate, requirePermission('grades.read'), ctrl.getAll);
router.get('/student/:studentId', authenticate, requirePermission('grades.read'), ctrl.getByStudent);
router.get('/bulletin/:studentId', authenticate, requirePermission('grades.read'), ctrl.getBulletin);
router.get('/bulletin/:studentId/pdf', authenticate, requirePermission('grades.read'), ctrl.getBulletinPdf);
router.post('/', authenticate, requirePermission('grades.write'), validate(gradeRules),
  auditLog('create', 'grade', req => `Note saisie : ${req.body.value}/${req.body.max_value || 20} (élève #${req.body.student_id})`), ctrl.create);
router.put('/:id', authenticate, requirePermission('grades.write'), validate([
  body('value').isFloat({ min: 0 }).withMessage('Note invalide'),
  body('max_value').optional().isFloat({ min: 1 }).withMessage('Barème invalide'),
]), auditLog('update', 'grade', req => `Note modifiée : ${req.body.value}/${req.body.max_value || 20}`), ctrl.update);
router.delete('/:id', authenticate, requirePermission('grades.write'),
  auditLog('delete', 'grade', () => 'Note supprimée'), ctrl.delete);

module.exports = router;
