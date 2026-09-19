const router  = require('express').Router();
const { authenticate, authorize } = require('../middleware/auth');
const { auditLog } = require('../services/activityLog');
const ctrl    = require('../controllers/messages.controller');

router.get('/groups',     authenticate, ctrl.getGroupCounts);
router.get('/recipients', authenticate, ctrl.getRecipients);
router.get('/sent',       authenticate, ctrl.getSent);
router.get('/',           authenticate, ctrl.getInbox);
router.get('/:id',        authenticate, ctrl.getOne);

// Envoi d'un nouveau message : directeur / super_admin / secrétariat
router.post('/', authenticate, authorize('director', 'super_admin', 'secretary'),
  auditLog('send', 'message', req => `Message envoyé : "${(req.body.subject || '').slice(0, 80)}"`), ctrl.send);

// Réponse : enseignants (+ directeur pour les tests)
router.post('/:id/reply', authenticate, ctrl.reply);

router.put('/:id/read', authenticate, ctrl.markRead);

module.exports = router;
