const router = require('express').Router();
const { authenticate, requirePermission } = require('../middleware/auth');
const { auditLog } = require('../services/activityLog');
const ctrl = require('../controllers/students.controller');

router.get('/parents', authenticate, requirePermission('students.read'), ctrl.getParents);
router.get('/export/excel', authenticate, requirePermission('students.read'), ctrl.exportExcel);
router.get('/', authenticate, requirePermission('students.read'), ctrl.getAll);
router.get('/:id', authenticate, requirePermission('students.read'), ctrl.getOne);
router.post('/', authenticate, requirePermission('students.write'),
  auditLog('create', 'student', req => `Élève créé : ${req.body.first_name} ${req.body.last_name}`), ctrl.create);
router.put('/:id', authenticate, requirePermission('students.write'),
  auditLog('update', 'student', req => `Élève modifié : ${req.body.first_name} ${req.body.last_name}`), ctrl.update);
router.delete('/:id', authenticate, requirePermission('students.delete'),
  auditLog('delete', 'student', () => 'Élève archivé'), ctrl.delete);

module.exports = router;
