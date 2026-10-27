// Formulaire « Contact » du site public : n'importe quel visiteur peut écrire au super admin.
// Un utilisateur connecté voit ses messages et les réponses dans la page Contact ; un visiteur
// sans compte reçoit une référence (ex. ECO-7KX3QM) qu'il saisit avec son email pour lire la réponse.
const crypto = require('crypto');
const db = require('../config/database');
const { readSession } = require('../utils/session');
const { handleError } = require('../utils/errors');
const { logActivity } = require('../services/activityLog');
const platform = require('../services/platform');

const REF_CHARS = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
function newReference() {
  const bytes = crypto.randomBytes(6);
  let out = 'ECO-';
  for (let i = 0; i < 6; i++) out += REF_CHARS[bytes[i] % REF_CHARS.length];
  return out;
}

// La route est publique : on rattache le message au compte seulement si une session valide est présente.
async function optionalUser(req) {
  try {
    const session = await readSession(req);
    return session?.user || null;
  } catch {
    return null;
  }
}

const PUBLIC_FIELDS = 'reference, subject, message, reply, replied_at, status, created_at';

// POST /contact — { name, email, phone?, subject?, message }
exports.send = async (req, res) => {
  try {
    await platform.ready;
    const user = await optionalUser(req);
    const name = String(req.body.name || (user ? `${user.first_name} ${user.last_name}` : '')).trim().slice(0, 150);
    const email = String(user?.email || req.body.email || '').trim().toLowerCase().slice(0, 190);
    const phone = String(req.body.phone || user?.phone || '').trim().slice(0, 50) || null;
    const subject = String(req.body.subject || '').trim().slice(0, 200) || null;
    const message = String(req.body.message || '').trim();

    if (!name) return res.status(400).json({ success: false, message: 'Votre nom est requis' });
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return res.status(400).json({ success: false, message: 'Email invalide' });
    if (message.length < 5) return res.status(400).json({ success: false, message: 'Votre message est trop court' });
    if (message.length > 5000) return res.status(400).json({ success: false, message: 'Message trop long (5000 caractères max.)' });

    const reference = newReference();
    await db.execute(
      'INSERT INTO contact_messages (reference, user_id, name, email, phone, subject, message) VALUES (?, ?, ?, ?, ?, ?, ?)',
      [reference, user?.id || null, name, email, phone, subject, message]
    );
    logActivity({
      schoolId: user?.school_id, userId: user?.id, userName: name, userRole: user?.role,
      action: 'create', entityType: 'contact_message', description: `Message de contact ${reference} envoyé par ${email}`, ip: req.ip,
    });
    res.status(201).json({ success: true, reference, message: 'Message envoyé. Nous vous répondrons dès que possible.' });
  } catch (err) { handleError(res, err); }
};

// POST /contact/lookup — { email, reference } : consultation de la réponse par un visiteur sans compte
exports.lookup = async (req, res) => {
  try {
    await platform.ready;
    const email = String(req.body.email || '').trim().toLowerCase();
    const reference = String(req.body.reference || '').trim().toUpperCase();
    const [[row]] = await db.execute(
      `SELECT ${PUBLIC_FIELDS} FROM contact_messages WHERE email = ? AND reference = ?`,
      [email, reference]
    );
    if (!row) return res.status(404).json({ success: false, message: 'Aucun message ne correspond à cet email et cette référence' });
    res.json({ success: true, data: row });
  } catch (err) { handleError(res, err); }
};

// GET /contact/mine — messages de l'utilisateur connecté avec les réponses du super admin
exports.mine = async (req, res) => {
  try {
    await platform.ready;
    const [rows] = await db.execute(
      `SELECT ${PUBLIC_FIELDS} FROM contact_messages WHERE user_id = ? ORDER BY created_at DESC LIMIT 50`,
      [req.user.id]
    );
    res.json({ success: true, data: rows });
  } catch (err) { handleError(res, err); }
};
