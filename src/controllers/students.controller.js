const db     = require('../config/database');
const bcrypt = require('bcryptjs');
const { handleError } = require('../utils/errors');
const { sendExcel } = require('../utils/excel');

function buildStudentsQuery(schoolId, { class_id, status, search }) {
  let query = `
    SELECT s.*, c.name as class_name, c.cycle,
           CONCAT(u.first_name, ' ', u.last_name) as parent_name,
           u.phone as parent_phone, u.email as parent_email
    FROM students s
    LEFT JOIN classes c ON s.class_id = c.id
    LEFT JOIN users u ON s.parent_id = u.id
    WHERE s.school_id = ?`;
  const params = [schoolId];
  if (class_id) { query += ' AND s.class_id = ?';  params.push(class_id); }
  if (status)   { query += ' AND s.status = ?';    params.push(status); }
  if (search)   { query += ' AND (s.first_name LIKE ? OR s.last_name LIKE ? OR s.matricule LIKE ?)'; params.push(`%${search}%`, `%${search}%`, `%${search}%`); }
  query += ' ORDER BY s.last_name, s.first_name';
  return { query, params };
}

const STATUS_LABELS_STUDENT = { pre_inscrit: 'Pré-inscrit', inscrit: 'Inscrit', reinscrit: 'Réinscrit', archive: 'Archivé' };

exports.getAll = async (req, res) => {
  try {
    const { query, params } = buildStudentsQuery(req.user.school_id, req.query);
    const [rows] = await db.execute(query, params);
    res.json({ success: true, data: rows, total: rows.length });
  } catch (err) { handleError(res, err); }
};

exports.exportExcel = async (req, res) => {
  try {
    const { query, params } = buildStudentsQuery(req.user.school_id, req.query);
    const [rows] = await db.execute(query, params);

    await sendExcel(res, 'eleves.xlsx', 'Élèves', [
      { header: 'Matricule', key: 'matricule', width: 14 },
      { header: 'Prénom', key: 'first_name', width: 18 },
      { header: 'Nom', key: 'last_name', width: 18 },
      { header: 'Genre', key: 'gender', width: 8 },
      { header: 'Classe', key: 'class_name', width: 12 },
      { header: 'Statut', key: 'status', width: 14 },
      { header: 'Parent', key: 'parent_name', width: 22 },
      { header: 'Téléphone parent', key: 'parent_phone', width: 16 },
    ], rows.map(r => ({
      matricule: r.matricule,
      first_name: r.first_name,
      last_name: r.last_name,
      gender: r.gender === 'M' ? 'Masculin' : 'Féminin',
      class_name: r.class_name || '—',
      status: STATUS_LABELS_STUDENT[r.status] || r.status,
      parent_name: r.parent_name || '—',
      parent_phone: r.parent_phone || '—',
    })));
  } catch (err) { handleError(res, err); }
};

exports.getOne = async (req, res) => {
  try {
    const [rows] = await db.execute(
      `SELECT s.*, c.name as class_name, c.cycle, c.level,
              CONCAT(u.first_name, ' ', u.last_name) as parent_name,
              u.phone as parent_phone, u.email as parent_email
       FROM students s
       LEFT JOIN classes c ON s.class_id = c.id
       LEFT JOIN users u ON s.parent_id = u.id
       WHERE s.id = ? AND s.school_id = ?`,
      [req.params.id, req.user.school_id]
    );
    if (!rows.length) return res.status(404).json({ success: false, message: 'Élève non trouvé' });
    res.json({ success: true, data: rows[0] });
  } catch (err) { handleError(res, err); }
};

// GET /students/parents — liste des parents de l'école (pour la sélection dans le formulaire)
exports.getParents = async (req, res) => {
  try {
    const { q } = req.query;
    let query = `SELECT id, first_name, last_name, email, phone
                 FROM users WHERE school_id = ? AND role = 'parent' AND is_active = 1`;
    const params = [req.user.school_id];
    if (q) { query += ' AND (first_name LIKE ? OR last_name LIKE ? OR email LIKE ?)'; params.push(`%${q}%`, `%${q}%`, `%${q}%`); }
    query += ' ORDER BY last_name, first_name LIMIT 50';
    const [rows] = await db.execute(query, params);
    res.json({ success: true, data: rows });
  } catch (err) { handleError(res, err); }
};

// Normalise un texte en slug utilisable dans un email
function toEmailSlug(str) {
  return (str || '').toLowerCase()
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]/g, '');
}

// Résoudre le parent_id : soit existant, soit créer un nouveau compte parent
// Retourne { id, isNew, email, password }
async function resolveParentId(parentId, parentData, schoolId) {
  if (parentId) return { id: parseInt(parentId), isNew: false, email: null, password: null };
  if (!parentData) return { id: null, isNew: false, email: null, password: null };

  const { first_name, last_name, email, phone } = parentData;
  if (!first_name && !last_name) return { id: null, isNew: false, email: null, password: null };

  // Si email fourni, vérifier si un compte existe déjà
  if (email && email.trim()) {
    const [existing] = await db.execute('SELECT id FROM users WHERE email = ?', [email.trim()]);
    if (existing.length) return { id: existing[0].id, isNew: false, email: email.trim(), password: null };
  }

  // Créer un nouveau compte parent
  const password = 'Ecolio1234!';
  const hash = await bcrypt.hash(password, 10);
  const safeEmail = email?.trim() || `parent_${Date.now()}@ecolio.local`;
  const [result] = await db.execute(
    'INSERT INTO users (school_id, first_name, last_name, email, phone, password, role, must_change_password) VALUES (?,?,?,?,?,?,?,1)',
    [schoolId, first_name, last_name, safeEmail, phone || null, hash, 'parent']
  );
  return { id: result.insertId, isNew: true, email: safeEmail, password };
}

exports.create = async (req, res) => {
  try {
    const {
      first_name, last_name, birth_date, birth_place, gender, class_id,
      parent_id, parent_data, address, blood_type, medical_notes,
      emergency_contact_name, emergency_contact_phone, status, student_email,
      matricule: customMatricule,
    } = req.body;

    if (!first_name || !last_name) {
      return res.status(400).json({ success: false, message: 'Prénom et nom sont requis' });
    }

    let matricule = customMatricule?.trim();
    if (matricule) {
      const [existingMatricule] = await db.execute('SELECT id FROM students WHERE matricule = ?', [matricule]);
      if (existingMatricule.length) {
        return res.status(409).json({ success: false, message: 'Ce matricule est déjà utilisé par un autre élève' });
      }
    } else {
      // Générer le matricule automatiquement
      const [last] = await db.execute(
        'SELECT matricule FROM students WHERE school_id = ? ORDER BY id DESC LIMIT 1',
        [req.user.school_id]
      );
      const nextNum = last.length ? parseInt(last[0].matricule?.split('-')[1] || '0') + 1 : 1;
      matricule = `ECO-${String(nextNum).padStart(4, '0')}`;
    }

    const parentResult = await resolveParentId(parent_id, parent_data, req.user.school_id);

    const [result] = await db.execute(
      `INSERT INTO students (school_id, matricule, first_name, last_name, birth_date, birth_place, gender,
         class_id, parent_id, address, blood_type, medical_notes,
         emergency_contact_name, emergency_contact_phone, status)
       VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
      [req.user.school_id, matricule, first_name, last_name,
       birth_date || null, birth_place || null, gender,
       class_id || null, parentResult.id,
       address || null, blood_type || null, medical_notes || null,
       emergency_contact_name || null, emergency_contact_phone || null,
       status || 'inscrit']
    );
    const studentId = result.insertId;

    // Créer le compte utilisateur de l'élève
    const studentPassword = matricule; // matricule comme mot de passe initial
    const hash = await bcrypt.hash(studentPassword, 10);
    const slug = `${toEmailSlug(first_name)}.${toEmailSlug(last_name)}`;
    const autoEmail = `${slug}.${matricule.toLowerCase()}@ecolio.local`;
    const finalStudentEmail = student_email?.trim() || autoEmail;

    let studentUserId = null;
    const [existingUser] = await db.execute('SELECT id FROM users WHERE email = ?', [finalStudentEmail]);
    if (!existingUser.length) {
      const [userResult] = await db.execute(
        'INSERT INTO users (school_id, first_name, last_name, email, password, role, must_change_password) VALUES (?,?,?,?,?,?,1)',
        [req.user.school_id, first_name, last_name, finalStudentEmail, hash, 'student']
      );
      studentUserId = userResult.insertId;
      // Lier le compte au dossier élève (migration_v4 — ignoré si colonne absente)
      try {
        await db.execute('UPDATE users SET student_id = ? WHERE id = ?', [studentId, studentUserId]);
      } catch (_) {}
    }

    res.status(201).json({
      success: true,
      id: studentId,
      matricule,
      parent_id: parentResult.id,
      credentials: {
        student: { email: finalStudentEmail, password: studentPassword },
        parent: parentResult.isNew ? { email: parentResult.email, password: parentResult.password } : null,
      },
    });
  } catch (err) {
    handleError(res, err);
  }
};

exports.update = async (req, res) => {
  try {
    const {
      first_name, last_name, birth_date, birth_place, gender, class_id,
      parent_id, parent_data, address, blood_type, medical_notes,
      emergency_contact_name, emergency_contact_phone, status, matricule,
    } = req.body;

    if (matricule?.trim()) {
      const [existingMatricule] = await db.execute(
        'SELECT id FROM students WHERE matricule = ? AND id != ?',
        [matricule.trim(), req.params.id]
      );
      if (existingMatricule.length) {
        return res.status(409).json({ success: false, message: 'Ce matricule est déjà utilisé par un autre élève' });
      }
    }

    const parentResult = await resolveParentId(parent_id, parent_data, req.user.school_id);

    await db.execute(
      `UPDATE students SET first_name=?, last_name=?, birth_date=?, birth_place=?, gender=?,
         class_id=?, parent_id=?, address=?, blood_type=?, medical_notes=?,
         emergency_contact_name=?, emergency_contact_phone=?, status=?, matricule=COALESCE(?, matricule)
       WHERE id=? AND school_id=?`,
      [first_name, last_name, birth_date || null, birth_place || null, gender,
       class_id || null, parentResult.id,
       address || null, blood_type || null, medical_notes || null,
       emergency_contact_name || null, emergency_contact_phone || null,
       status, matricule?.trim() || null, req.params.id, req.user.school_id]
    );
    res.json({ success: true, message: 'Élève mis à jour', parent_id: parentResult.id });
  } catch (err) {
    handleError(res, err);
  }
};

exports.delete = async (req, res) => {
  try {
    await db.execute(
      "UPDATE students SET status='archive' WHERE id=? AND school_id=?",
      [req.params.id, req.user.school_id]
    );
    res.json({ success: true, message: 'Élève archivé' });
  } catch (err) { handleError(res, err); }
};
