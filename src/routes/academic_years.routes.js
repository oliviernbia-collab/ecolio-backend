const router = require('express').Router();
const { authenticate, requirePermission } = require('../middleware/auth');
const ctrl = require('../controllers/academic_years.controller');

const dir = requirePermission('academic_years.write');

router.get('/',          authenticate, ctrl.getAll);
router.get('/:id',       authenticate, ctrl.getOne);
router.post('/',         authenticate, dir, ctrl.create);
router.put('/:id',       authenticate, dir, ctrl.update);
router.put('/:id/current', authenticate, dir, ctrl.setCurrent);
router.put('/:id/close', authenticate, dir, ctrl.close);
router.delete('/:id',    authenticate, dir, ctrl.remove);

module.exports = router;
