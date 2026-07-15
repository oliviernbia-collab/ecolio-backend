const router = require('express').Router();
const { authenticate } = require('../middleware/auth');
const ctrl = require('../controllers/rooms.controller');

router.get('/', authenticate, ctrl.getAll);

module.exports = router;
