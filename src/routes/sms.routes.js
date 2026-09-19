const router = require('express').Router();
const { authenticate, requirePermission } = require('../middleware/auth');
const { auditLog } = require('../services/activityLog');
const ctrl = require('../controllers/sms.controller');

router.get('/groups',     authenticate, requirePermission('sms.send'), ctrl.getGroupCounts);
router.get('/recipients', authenticate, requirePermission('sms.send'), ctrl.getRecipients);
router.get('/',           authenticate, requirePermission('sms.send'), ctrl.getHistory);
router.get('/:id',        authenticate, requirePermission('sms.send'), ctrl.getOne);
router.post('/',          authenticate, requirePermission('sms.send'),
  auditLog('send', 'sms', req => `SMS envoyé${req.body.recipient_group ? ` au groupe "${req.body.recipient_group}"` : ` (${(req.body.recipient_ids || []).length} destinataire(s))`}`), ctrl.send);

module.exports = router;
