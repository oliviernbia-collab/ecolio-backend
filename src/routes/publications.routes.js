const router = require('express').Router();
const { authenticate, requirePermission } = require('../middleware/auth');
const upload = require('../middleware/upload');
const ctrl = require('../controllers/publications.controller');

router.get('/',    authenticate, requirePermission('publications.manage'), ctrl.getAll);
router.post('/',   authenticate, requirePermission('publications.manage'), upload.single('media'), ctrl.create);
router.delete('/:id', authenticate, requirePermission('publications.manage'), ctrl.remove);

module.exports = router;
