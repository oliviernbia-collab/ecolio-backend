const db = require('../config/database');
const { handleError } = require('../utils/errors');

// GET /public/schools?city= — écoles ayant activé la visibilité publique
exports.getSchools = async (req, res) => {
  try {
    const { city } = req.query;
    let query = 'SELECT id, name, city, logo_url, primary_color FROM schools WHERE is_public=1';
    const params = [];
    if (city) { query += ' AND city=?'; params.push(city); }
    query += ' ORDER BY name';
    const [rows] = await db.execute(query, params);
    res.json({ success: true, data: rows });
  } catch (err) {
    handleError(res, err);
  }
};

// GET /public/cities — villes distinctes des écoles publiques (pour le filtre)
exports.getCities = async (req, res) => {
  try {
    const [rows] = await db.execute(
      "SELECT DISTINCT city FROM schools WHERE is_public=1 AND city IS NOT NULL AND city != '' ORDER BY city"
    );
    res.json({ success: true, data: rows.map(r => r.city) });
  } catch (err) {
    handleError(res, err);
  }
};

// GET /public/top-students/years — années scolaires (par nom) ayant au moins une entrée
// de tableau d'honneur, les plus récentes en premier. Contrairement à /public/schools,
// pas de filtre is_public : désigner un major est déjà l'action de publication en soi,
// indépendante du fait que l'école ait activé sa fiche dans l'annuaire "Écoles partenaires".
exports.getTopStudentYears = async (req, res) => {
  try {
    const [rows] = await db.execute(`
      SELECT ay.name, MAX(ay.start_date) as start_date
      FROM top_students ts
      JOIN academic_years ay ON ts.academic_year_id = ay.id
      JOIN schools s ON ts.school_id = s.id
      WHERE s.is_active = 1
      GROUP BY ay.name
      ORDER BY start_date DESC
    `);
    res.json({ success: true, data: rows.map(r => r.name) });
  } catch (err) { handleError(res, err); }
};

// GET /public/top-students?academic_year_name=&period=&limit= — tableau d'honneur public,
// visible pour toutes les écoles actives (voir note is_public ci-dessus).
exports.getTopStudents = async (req, res) => {
  try {
    const { academic_year_name, period, limit } = req.query;
    const params = [];
    let where = 'WHERE s.is_active = 1';
    if (academic_year_name) { where += ' AND ay.name = ?'; params.push(academic_year_name); }
    if (period) { where += ' AND ts.period = ?'; params.push(period); }

    let sql = `
      SELECT ts.id, ts.period, ts.level, ts.cycle, ts.average, ts.mention,
             CONCAT(st.first_name, ' ', st.last_name) as student_name,
             ay.name as academic_year_name,
             s.id as school_id, s.name as school_name, s.city as school_city,
             s.logo_url as school_logo, s.primary_color
      FROM top_students ts
      JOIN students st ON ts.student_id = st.id
      JOIN academic_years ay ON ts.academic_year_id = ay.id
      JOIN schools s ON ts.school_id = s.id
      ${where}
      ORDER BY s.name, ts.cycle, ts.level
    `;
    if (limit) { sql += ` LIMIT ${Math.max(1, Math.min(50, parseInt(limit, 10) || 6))}`; }

    const [rows] = await db.execute(sql, params);
    res.json({ success: true, data: rows });
  } catch (err) { handleError(res, err); }
};
