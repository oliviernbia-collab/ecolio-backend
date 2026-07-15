const router = require('express').Router();
const { authenticate, authorize } = require('../middleware/auth');
const upload = require('../middleware/upload');
const ctrl   = require('../controllers/uploads.controller');

// Photo de profil (utilisateur connecté)
router.post(
  '/avatar',
  authenticate,
  (req, res, next) => { req.uploadSubDir = 'avatars'; next(); },
  upload.single('avatar'),
  ctrl.uploadAvatar
);

// Photo d'un élève
router.post(
  '/student/:id',
  authenticate,
  authorize('director', 'super_admin', 'teacher'),
  (req, res, next) => { req.uploadSubDir = 'students'; next(); },
  upload.single('photo'),
  ctrl.uploadStudentPhoto
);

// Logo de l'école
router.post(
  '/school-logo',
  authenticate,
  authorize('director', 'super_admin'),
  (req, res, next) => { req.uploadSubDir = 'logos'; next(); },
  upload.single('logo'),
  ctrl.uploadSchoolLogo
);

module.exports = router;
