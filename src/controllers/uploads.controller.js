const db   = require('../config/database');
const path = require('path');
const fs   = require('fs');
const { handleError } = require('../utils/errors');

const BASE_URL = process.env.API_URL || 'http://localhost:5000';

function fileUrl(subDir, filename) {
  return `${BASE_URL}/uploads/${subDir}/${filename}`;
}

function deleteOldFile(url) {
  if (!url) return;
  try {
    const rel  = url.replace(`${BASE_URL}/uploads/`, '');
    const full = path.join(__dirname, '../../uploads', rel);
    if (fs.existsSync(full)) fs.unlinkSync(full);
  } catch (_) {}
}

// ── POST /api/uploads/avatar ──────────────────────────────────────────────────
exports.uploadAvatar = async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ success: false, message: 'Aucun fichier reçu' });

    const url = fileUrl('avatars', req.file.filename);

    // Supprimer l'ancienne photo
    const [rows] = await db.execute('SELECT avatar_url FROM users WHERE id = ?', [req.user.id]);
    if (rows[0]?.avatar_url) deleteOldFile(rows[0].avatar_url);

    await db.execute('UPDATE users SET avatar_url = ? WHERE id = ?', [url, req.user.id]);
    res.json({ success: true, url, message: 'Photo de profil mise à jour' });
  } catch (err) {
    handleError(res, err);
  }
};

// ── POST /api/uploads/student/:id ─────────────────────────────────────────────
exports.uploadStudentPhoto = async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ success: false, message: 'Aucun fichier reçu' });

    const { id } = req.params;
    const [rows] = await db.execute(
      'SELECT photo_url FROM students WHERE id = ? AND school_id = ?',
      [id, req.user.school_id]
    );
    if (!rows.length) return res.status(404).json({ success: false, message: 'Élève non trouvé' });
    if (rows[0]?.photo_url) deleteOldFile(rows[0].photo_url);

    const url = fileUrl('students', req.file.filename);
    await db.execute('UPDATE students SET photo_url = ? WHERE id = ?', [url, id]);
    res.json({ success: true, url, message: 'Photo de l\'élève mise à jour' });
  } catch (err) {
    handleError(res, err);
  }
};

// ── POST /api/uploads/school-logo ─────────────────────────────────────────────
exports.uploadSchoolLogo = async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ success: false, message: 'Aucun fichier reçu' });

    const [rows] = await db.execute('SELECT logo_url FROM schools WHERE id = ?', [req.user.school_id]);
    if (rows[0]?.logo_url) deleteOldFile(rows[0].logo_url);

    const url = fileUrl('logos', req.file.filename);
    await db.execute('UPDATE schools SET logo_url = ? WHERE id = ?', [url, req.user.school_id]);
    res.json({ success: true, url, message: 'Logo mis à jour' });
  } catch (err) {
    handleError(res, err);
  }
};
