const multer = require('multer');

// Stockage en mémoire : le buffer est envoyé à Cloudinary explicitement par chaque
// contrôleur (voir services/cloudinaryUpload.js), plutôt que via multer-storage-cloudinary
// (package figé sur cloudinary@^1.x, incompatible avec le SDK v2 corrigé — voir CVE
// GHSA-g4mf-96x5-5m2c sur les versions <2.7.0 du SDK Cloudinary).
const storage = multer.memoryStorage();

const ALLOWED_IMAGE_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'image/gif'];
const ALLOWED_VIDEO_TYPES = ['video/mp4', 'video/webm', 'video/quicktime'];

const fileFilter = (req, file, cb) => {
  if (ALLOWED_IMAGE_TYPES.includes(file.mimetype) || ALLOWED_VIDEO_TYPES.includes(file.mimetype)) cb(null, true);
  else cb(new Error('Format non supporté. Utilisez JPEG, PNG, WebP, GIF, MP4, WebM ou MOV.'));
};

const upload = multer({
  storage,
  fileFilter,
  limits: { fileSize: 50 * 1024 * 1024 }, // 50 Mo (marge pour les vidéos)
});

module.exports = upload;
