const multer = require('multer');
const path   = require('path');
const fs     = require('fs');

const UPLOADS_ROOT = path.join(__dirname, '../../uploads');

function ensureDir(dir) {
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
}

const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    const sub = req.uploadSubDir || 'misc';
    const dir = path.join(UPLOADS_ROOT, sub);
    ensureDir(dir);
    cb(null, dir);
  },
  filename: (req, file, cb) => {
    const ext  = path.extname(file.originalname).toLowerCase();
    const name = `${Date.now()}-${Math.random().toString(36).slice(2, 9)}${ext}`;
    cb(null, name);
  },
});

const fileFilter = (req, file, cb) => {
  const allowed = ['image/jpeg', 'image/png', 'image/webp', 'image/gif'];
  if (allowed.includes(file.mimetype)) cb(null, true);
  else cb(new Error('Format non supporté. Utilisez JPEG, PNG ou WebP.'));
};

const upload = multer({
  storage,
  fileFilter,
  limits: { fileSize: 3 * 1024 * 1024 }, // 3 Mo max
});

module.exports = upload;
module.exports.UPLOADS_ROOT = UPLOADS_ROOT;
