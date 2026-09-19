const db = require('../config/database');
const { uploadBuffer, destroyAsset, extractPublicId } = require('../services/cloudinaryUpload');
const { handleError } = require('../utils/errors');

async function deleteOldAsset(url) {
  await destroyAsset(extractPublicId(url), 'image');
}

// ── POST /api/uploads/avatar ──────────────────────────────────────────────────
exports.uploadAvatar = async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ success: false, message: 'Aucun fichier reçu' });

    const result = await uploadBuffer(req.file.buffer, { folder: 'ecolio/avatars' });
    const url = result.secure_url;

    const [rows] = await db.execute('SELECT avatar_url FROM users WHERE id = ?', [req.user.id]);
    if (rows[0]?.avatar_url) deleteOldAsset(rows[0].avatar_url);

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
    if (rows[0]?.photo_url) deleteOldAsset(rows[0].photo_url);

    const result = await uploadBuffer(req.file.buffer, { folder: 'ecolio/students' });
    const url = result.secure_url;
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
    if (rows[0]?.logo_url) deleteOldAsset(rows[0].logo_url);

    const result = await uploadBuffer(req.file.buffer, { folder: 'ecolio/logos' });
    const url = result.secure_url;
    await db.execute('UPDATE schools SET logo_url = ? WHERE id = ?', [url, req.user.school_id]);
    res.json({ success: true, url, message: 'Logo mis à jour' });
  } catch (err) {
    handleError(res, err);
  }
};
