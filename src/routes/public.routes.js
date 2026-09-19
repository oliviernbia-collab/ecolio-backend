const router = require('express').Router();
const ctrl = require('../controllers/public.controller');

// Endpoints publics — aucune authentification requise (page d'accueil)
router.get('/schools', ctrl.getSchools);
router.get('/cities',  ctrl.getCities);
router.get('/top-students',       ctrl.getTopStudents);
router.get('/top-students/years', ctrl.getTopStudentYears);

module.exports = router;
