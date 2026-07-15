const router = require('express').Router();
const ctrl = require('../controllers/public.controller');

// Endpoints publics — aucune authentification requise (page d'accueil)
router.get('/schools', ctrl.getSchools);
router.get('/cities',  ctrl.getCities);

module.exports = router;
