const router = require('express').Router();
const { authenticate, requirePermission } = require('../middleware/auth');
const ctrl = require('../controllers/students.controller');

router.get('/parents', authenticate, ctrl.getParents);
router.get('/export/excel', authenticate, requirePermission('students.read'), ctrl.exportExcel);
router.get('/', authenticate, ctrl.getAll);
router.get('/:id', authenticate, ctrl.getOne);
router.post('/', authenticate, requirePermission('students.write'), ctrl.create);
router.put('/:id', authenticate, requirePermission('students.write'), ctrl.update);
router.delete('/:id', authenticate, requirePermission('students.delete'), ctrl.delete);

module.exports = router;
