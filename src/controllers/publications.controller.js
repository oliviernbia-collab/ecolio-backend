const db = require('../config/database');
const { handleError } = require('../utils/errors');
const { logActivity } = require('../services/activityLog');
const { uploadBuffer, destroyAsset, extractPublicId } = require('../services/cloudinaryUpload');

const VALID_TYPES = ['image', 'video', 'announcement', 'other'];

// GET /publications — publications de l'école connectée (gestion, staff autorisé)
exports.getAll = async (req, res) => {
  try {
    const [rows] = await db.execute(
      `SELECT p.*, CONCAT(u.first_name, ' ', u.last_name) as created_by_name
       FROM school_publications p
       LEFT JOIN users u ON p.created_by = u.id
       WHERE p.school_id = ?
       ORDER BY p.created_at DESC`,
      [req.user.school_id]
    );
    res.json({ success: true, data: rows });
  } catch (err) { handleError(res, err); }
};

// POST /publications — crée une publication publique (image, vidéo ou annonce texte)
exports.create = async (req, res) => {
  try {
    const { type, title, content } = req.body;
    if (!type || !VALID_TYPES.includes(type)) {
      return res.status(400).json({ success: false, message: 'Type de publication invalide' });
    }
    if (type === 'announcement' && !content) {
      return res.status(400).json({ success: false, message: 'Le contenu est requis pour une annonce' });
    }
    if ((type === 'image' || type === 'video') && !req.file) {
      return res.status(400).json({ success: false, message: 'Un fichier est requis pour ce type de publication' });
    }

    let mediaUrl = null;
    let mediaType = null;
    if (req.file) {
      const resourceType = req.file.mimetype.startsWith('video/') ? 'video' : 'image';
      const uploaded = await uploadBuffer(req.file.buffer, { folder: 'ecolio/publications', resourceType });
      mediaUrl = uploaded.secure_url;
      mediaType = req.file.mimetype;
    }

    const [result] = await db.execute(
      `INSERT INTO school_publications (school_id, type, title, content, media_url, media_type, created_by)
       VALUES (?,?,?,?,?,?,?)`,
      [req.user.school_id, type, title || null, content || null, mediaUrl, mediaType, req.user.id]
    );

    logActivity({
      schoolId: req.user.school_id, userId: req.user.id, userName: `${req.user.first_name} ${req.user.last_name}`, userRole: req.user.role,
      action: 'create', entityType: 'publication', entityId: result.insertId,
      description: `Publication publiée : ${title || type}`, ip: req.ip,
    });

    res.status(201).json({ success: true, message: 'Publication publiée', id: result.insertId });
  } catch (err) { handleError(res, err); }
};

// DELETE /publications/:id
exports.remove = async (req, res) => {
  try {
    const [[pub]] = await db.execute(
      'SELECT media_url, media_type FROM school_publications WHERE id = ? AND school_id = ?',
      [req.params.id, req.user.school_id]
    );
    if (!pub) return res.status(404).json({ success: false, message: 'Introuvable' });

    const [result] = await db.execute('DELETE FROM school_publications WHERE id = ? AND school_id = ?', [req.params.id, req.user.school_id]);
    if (!result.affectedRows) return res.status(404).json({ success: false, message: 'Introuvable' });

    if (pub.media_url) {
      const publicId = extractPublicId(pub.media_url);
      if (publicId) destroyAsset(publicId, pub.media_type && pub.media_type.startsWith('video/') ? 'video' : 'image');
    }

    logActivity({
      schoolId: req.user.school_id, userId: req.user.id, userName: `${req.user.first_name} ${req.user.last_name}`, userRole: req.user.role,
      action: 'delete', entityType: 'publication', entityId: req.params.id,
      description: 'Publication supprimée', ip: req.ip,
    });

    res.json({ success: true, message: 'Publication supprimée' });
  } catch (err) { handleError(res, err); }
};
