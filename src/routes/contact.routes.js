const router = require('express').Router();
const { authenticate } = require('../middleware/auth');
const ctrl = require('../controllers/contact.controller');

// Envoi et consultation publics (visiteurs sans compte) ; /mine pour un utilisateur connecté
router.post('/', ctrl.send);
router.post('/lookup', ctrl.lookup);
router.get('/mine', authenticate, ctrl.mine);

module.exports = router;
