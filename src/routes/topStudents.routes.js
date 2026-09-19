const router = require('express').Router();
const { authenticate, requirePermission } = require('../middleware/auth');
const ctrl = require('../controllers/topStudents.controller');

router.get('/', authenticate, requirePermission('top_students.manage'), ctrl.getAll);
router.post('/', authenticate, requirePermission('top_students.manage'), ctrl.upsert);
router.delete('/:id', authenticate, requirePermission('top_students.manage'), ctrl.remove);

module.exports = router;
