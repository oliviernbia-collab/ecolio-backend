const db = require('../config/database');

// Enregistre une ligne dans le journal d'activité. N'écrit jamais d'exception vers
// l'appelant : le log ne doit jamais faire échouer l'action métier qu'il accompagne.
async function logActivity({ schoolId, userId, userName, userRole, action, entityType, entityId, description, ip }) {
  try {
    await db.execute(
      `INSERT INTO activity_logs (school_id, user_id, user_name, user_role, action, entity_type, entity_id, description, ip_address)
       VALUES (?,?,?,?,?,?,?,?,?)`,
      [schoolId ?? null, userId ?? null, userName ?? null, userRole ?? null,
       action, entityType, entityId ?? null, description ?? null, ip ?? null]
    );
  } catch (err) {
    console.error('[ActivityLog] échec d\'écriture:', err.message);
  }
}

// Middleware générique : journalise automatiquement les requêtes de mutation qui
// aboutissent à une réponse 2xx success:true, sans dupliquer de code dans chaque contrôleur.
// `describe` reçoit (req, responseBody) et retourne la description textuelle du log.
function auditLog(action, entityType, describe) {
  return (req, res, next) => {
    const originalJson = res.json.bind(res);
    res.json = (body) => {
      if (res.statusCode >= 200 && res.statusCode < 300 && body?.success !== false) {
        const description = typeof describe === 'function' ? describe(req, body) : describe;
        logActivity({
          schoolId: req.user?.school_id ?? null,
          userId: req.user?.id ?? null,
          userName: req.user ? `${req.user.first_name} ${req.user.last_name}` : null,
          userRole: req.user?.role ?? null,
          action,
          entityType,
          entityId: body?.id ?? req.params?.id ?? null,
          description,
          ip: req.ip,
        });
      }
      return originalJson(body);
    };
    next();
  };
}

module.exports = { logActivity, auditLog };
