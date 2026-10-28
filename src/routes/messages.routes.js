const router  = require('express').Router();
const { authenticate, authorize } = require('../middleware/auth');
const { auditLog } = require('../services/activityLog');
const ctrl    = require('../controllers/messages.controller');

// Annuaire et groupes de destinataires : réservés à ceux qui peuvent écrire un nouveau message
// (sinon un parent ou un élève pourrait lister les noms et e-mails de toute l'école)
const SENDERS = ['director', 'super_admin', 'secretary'];
router.get('/groups',     authenticate, authorize(...SENDERS), ctrl.getGroupCounts);
router.get('/recipients', authenticate, authorize(...SENDERS), ctrl.getRecipients);
router.get('/sent',       authenticate, ctrl.getSent);
router.get('/',           authenticate, ctrl.getInbox);
router.get('/:id',        authenticate, ctrl.getOne);

// Envoi d'un nouveau message : directeur / super_admin / secrétariat
router.post('/', authenticate, authorize(...SENDERS),
  auditLog('send', 'message', req => `Message envoyé : "${(req.body.subject || '').slice(0, 80)}"`), ctrl.send);

// Réponse à un message reçu : personnel et parents (contrôlé dans le contrôleur)
router.post('/:id/reply', authenticate, ctrl.reply);

router.put('/:id/read', authenticate, ctrl.markRead);

module.exports = router;
