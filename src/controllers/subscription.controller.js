const db = require('../config/database');
const { handleError } = require('../utils/errors');
const { logActivity } = require('../services/activityLog');
const { getSubscriptionState, SUBSCRIPTION_PRICE, WAVE_NUMBER } = require('../services/subscription');
const { uploadBuffer } = require('../services/cloudinaryUpload');

// GET /subscription/status — état d'abonnement de l'école connectée + historique des paiements soumis
exports.getStatus = async (req, res) => {
  try {
    const [[school]] = await db.execute(
      'SELECT trial_ends_at, subscription_paid_until FROM schools WHERE id = ?',
      [req.user.school_id]
    );
    const subscription = getSubscriptionState(school);
    const [payments] = await db.execute(
      `SELECT id, amount, wave_number, proof_url, reference, status, submitted_at, reviewed_at, review_note
       FROM subscription_payments WHERE school_id = ? ORDER BY submitted_at DESC LIMIT 20`,
      [req.user.school_id]
    );
    res.json({ success: true, subscription, payments, price: SUBSCRIPTION_PRICE, wave_number: WAVE_NUMBER });
  } catch (err) { handleError(res, err); }
};

// POST /subscription/payments — soumission d'une preuve de paiement (capture d'écran Wave)
exports.submitPayment = async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ success: false, message: 'Capture d\'écran du paiement requise' });
    const { reference } = req.body;
    const uploaded = await uploadBuffer(req.file.buffer, { folder: 'ecolio/payment_proofs' });
    const url = uploaded.secure_url;

    const [result] = await db.execute(
      `INSERT INTO subscription_payments (school_id, amount, wave_number, proof_url, reference, submitted_by)
       VALUES (?,?,?,?,?,?)`,
      [req.user.school_id, SUBSCRIPTION_PRICE, WAVE_NUMBER, url, reference || null, req.user.id]
    );

    logActivity({
      schoolId: req.user.school_id, userId: req.user.id, userName: `${req.user.first_name} ${req.user.last_name}`, userRole: req.user.role,
      action: 'create', entityType: 'subscription_payment', entityId: result.insertId,
      description: `Preuve de paiement soumise (${SUBSCRIPTION_PRICE} FCFA)`, ip: req.ip,
    });

    res.status(201).json({ success: true, id: result.insertId, message: 'Preuve de paiement envoyée. En attente de vérification.' });
  } catch (err) { handleError(res, err); }
};
