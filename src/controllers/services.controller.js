const db = require('../config/database');
const { handleError } = require('../utils/errors');

// ── Services (cantine / transport) ──────────────────────────────────────────

exports.getServices = async (req, res) => {
  try {
    const { type } = req.query;
    let query = 'SELECT * FROM services WHERE school_id=?';
    const params = [req.user.school_id];
    if (type) { query += ' AND type=?'; params.push(type); }
    query += ' ORDER BY type, name';
    const [rows] = await db.execute(query, params);
    res.json({ success: true, data: rows });
  } catch (err) { handleError(res, err); }
};

exports.createService = async (req, res) => {
  try {
    const { type, name, description, price } = req.body;
    if (!['cantine', 'transport'].includes(type) || !name) {
      return res.status(400).json({ success: false, message: 'Type et nom sont requis' });
    }
    const numPrice = parseFloat(price);
    if (isNaN(numPrice) || numPrice < 0) return res.status(400).json({ success: false, message: 'Prix invalide' });
    const [result] = await db.execute(
      'INSERT INTO services (school_id, type, name, description, price) VALUES (?,?,?,?,?)',
      [req.user.school_id, type, name, description || null, numPrice]
    );
    res.status(201).json({ success: true, id: result.insertId });
  } catch (err) { handleError(res, err); }
};

exports.updateService = async (req, res) => {
  try {
    const { name, description, price, is_active } = req.body;
    const numPrice = parseFloat(price);
    if (isNaN(numPrice) || numPrice < 0) return res.status(400).json({ success: false, message: 'Prix invalide' });
    await db.execute(
      'UPDATE services SET name=?, description=?, price=?, is_active=? WHERE id=? AND school_id=?',
      [name, description || null, numPrice, is_active !== undefined ? (is_active ? 1 : 0) : 1, req.params.id, req.user.school_id]
    );
    res.json({ success: true, message: 'Service mis à jour' });
  } catch (err) { handleError(res, err); }
};

exports.deleteService = async (req, res) => {
  try {
    await db.execute('DELETE FROM services WHERE id=? AND school_id=?', [req.params.id, req.user.school_id]);
    res.json({ success: true, message: 'Service supprimé' });
  } catch (err) { handleError(res, err); }
};

// ── Abonnements ──────────────────────────────────────────────────────────────

exports.getSubscriptions = async (req, res) => {
  try {
    const { service_id, status, student_id } = req.query;
    let query = `
      SELECT ss.*, sv.name as service_name, sv.type as service_type, sv.price,
             CONCAT(s.first_name,' ',s.last_name) as student_name, s.matricule, c.name as class_name
      FROM service_subscriptions ss
      JOIN services sv ON ss.service_id=sv.id
      JOIN students s ON ss.student_id=s.id
      LEFT JOIN classes c ON s.class_id=c.id
      WHERE ss.school_id=?`;
    const params = [req.user.school_id];
    if (service_id) { query += ' AND ss.service_id=?'; params.push(service_id); }
    if (status)     { query += ' AND ss.status=?';     params.push(status); }
    if (student_id) { query += ' AND ss.student_id=?'; params.push(student_id); }
    query += ' ORDER BY ss.created_at DESC';
    const [rows] = await db.execute(query, params);
    res.json({ success: true, data: rows });
  } catch (err) { handleError(res, err); }
};

exports.createSubscription = async (req, res) => {
  try {
    const { service_id, student_id, start_date, notes } = req.body;
    if (!service_id || !student_id || !start_date) {
      return res.status(400).json({ success: false, message: 'Service, élève et date de début sont requis' });
    }
    const [service] = await db.execute('SELECT id FROM services WHERE id=? AND school_id=?', [service_id, req.user.school_id]);
    if (!service.length) return res.status(404).json({ success: false, message: 'Service non trouvé' });
    const [student] = await db.execute('SELECT id FROM students WHERE id=? AND school_id=?', [student_id, req.user.school_id]);
    if (!student.length) return res.status(404).json({ success: false, message: 'Élève non trouvé' });

    const [result] = await db.execute(
      'INSERT INTO service_subscriptions (school_id, service_id, student_id, start_date, notes, created_by) VALUES (?,?,?,?,?,?)',
      [req.user.school_id, service_id, student_id, start_date, notes || null, req.user.id]
    );
    res.status(201).json({ success: true, id: result.insertId });
  } catch (err) { handleError(res, err); }
};

exports.updateSubscriptionStatus = async (req, res) => {
  try {
    const { status, end_date } = req.body;
    if (!['active', 'suspendu', 'termine'].includes(status)) {
      return res.status(400).json({ success: false, message: 'Statut invalide' });
    }
    await db.execute(
      'UPDATE service_subscriptions SET status=?, end_date=? WHERE id=? AND school_id=?',
      [status, end_date || null, req.params.id, req.user.school_id]
    );
    res.json({ success: true, message: 'Abonnement mis à jour' });
  } catch (err) { handleError(res, err); }
};
