const path = require('path');
const fs = require('fs');
const mysql = require('mysql2/promise');
const bcrypt = require('bcryptjs');
const dotenv = require('dotenv');

dotenv.config({ path: path.join(__dirname, '../.env.test'), override: true });

const MIGRATIONS = [
  'migration_v2.sql', 'migration_v3.sql', 'migration_v4.sql', 'migration_v5.sql',
  'migration_v6.sql', 'migration_v7.sql', 'migration_v8.sql', 'migration_v9.sql',
  'migration_v10.sql', 'migration_v11.sql', 'migration_v12.sql', 'migration_v13.sql',
  'migration_v14.sql', 'migration_v15.sql', 'migration_v16.sql', 'migration_v17.sql',
];

module.exports = async () => {
  const dbName = process.env.DB_NAME;
  const root = await mysql.createConnection({
    host: process.env.DB_HOST, user: process.env.DB_USER, password: process.env.DB_PASSWORD,
    port: process.env.DB_PORT, multipleStatements: true,
  });
  await root.query(`DROP DATABASE IF EXISTS \`${dbName}\``);
  await root.query(`CREATE DATABASE \`${dbName}\` CHARACTER SET utf8mb4`);
  await root.end();

  const conn = await mysql.createConnection({
    host: process.env.DB_HOST, user: process.env.DB_USER, password: process.env.DB_PASSWORD,
    database: dbName, port: process.env.DB_PORT, multipleStatements: true,
  });

  // schema.sql a été partiellement mis à jour au fil du temps avec des bouts de
  // migrations (colonnes ajoutées directement) sans que les fichiers migration_vX
  // correspondants soient retirés — on rejoue donc schema.sql + toutes les migrations
  // en tolérant les erreurs "déjà existant" (colonne/clé/contrainte dupliquée),
  // le fichier réel de référence restant la base de production, pas ce script.
  const IGNORABLE_ERRNOS = new Set([1060, 1061, 1050, 1826, 1022, 121]); // dup column/key/table/fk/constraint
  const runTolerant = async (sql) => {
    const statements = sql.split(';').map(s => s.trim()).filter(Boolean);
    for (const stmt of statements) {
      try {
        await conn.query(stmt);
      } catch (e) {
        if (!IGNORABLE_ERRNOS.has(e.errno)) throw new Error(`Échec sur: ${stmt.slice(0, 80)}...\n${e.message}`);
      }
    }
  };

  // schema.sql contient "CREATE DATABASE ecolio;" / "USE ecolio;" en dur — on les retire
  // pour ne jamais rediriger cette connexion vers la base de production par erreur.
  const schema = fs.readFileSync(path.join(__dirname, '../src/database/schema.sql'), 'utf8')
    .replace(/CREATE DATABASE[^;]*;/i, '')
    .replace(/USE\s+ecolio\s*;/i, '');
  await runTolerant(schema);
  for (const file of MIGRATIONS) {
    const sql = fs.readFileSync(path.join(__dirname, '../src/database/', file), 'utf8');
    await runTolerant(sql);
  }

  // Garde-fou : si un script a changé la base active (ex: un futur "USE xxx;" oublié),
  // on préfère planter bruyamment plutôt que de continuer à écrire ailleurs que dans ecolio_test.
  const [[{ db: activeDb }]] = await conn.query('SELECT DATABASE() as db');
  if (activeDb !== dbName) {
    throw new Error(`Sécurité : la connexion pointe vers "${activeDb}" au lieu de "${dbName}" — arrêt avant insertion des fixtures.`);
  }

  // ── Fixtures : deux écoles distinctes pour les tests d'isolation multi-tenant ──
  // trial_ends_at loin dans le futur : ces écoles ne doivent jamais être bloquées par
  // la vérification d'abonnement (middleware authenticate) au cours des tests, sauf le
  // test dédié à ce mécanisme (billing.test.js) qui le désactive explicitement lui-même.
  const [schoolA] = await conn.query("INSERT INTO schools (name, city, trial_ends_at) VALUES ('École Test A', 'Abidjan', DATE_ADD(NOW(), INTERVAL 365 DAY))");
  const [schoolB] = await conn.query("INSERT INTO schools (name, city, trial_ends_at) VALUES ('École Test B', 'Bouaké', DATE_ADD(NOW(), INTERVAL 365 DAY))");
  const schoolAId = schoolA.insertId;
  const schoolBId = schoolB.insertId;

  const hash = await bcrypt.hash('Test1234!', 10);
  const users = {};
  const roleList = ['director', 'teacher', 'parent', 'accountant', 'secretary', 'counselor'];
  for (const role of roleList) {
    const [res] = await conn.query(
      'INSERT INTO users (school_id, first_name, last_name, email, password, role) VALUES (?,?,?,?,?,?)',
      [schoolAId, role, 'TestA', `${role}.a@test.local`, hash, role]
    );
    users[`${role}A`] = res.insertId;
  }
  const [directorBRes] = await conn.query(
    'INSERT INTO users (school_id, first_name, last_name, email, password, role) VALUES (?,?,?,?,?,?)',
    [schoolBId, 'director', 'TestB', 'director.b@test.local', hash, 'director']
  );
  users.directorB = directorBRes.insertId;

  const [classA] = await conn.query(
    "INSERT INTO classes (school_id, academic_year_id, name, level, cycle, capacity) VALUES (?, NULL, 'CP-A', 'CP', 'primaire', 30)",
    [schoolAId]
  );
  const [classB] = await conn.query(
    "INSERT INTO classes (school_id, academic_year_id, name, level, cycle, capacity) VALUES (?, NULL, 'CP-B', 'CP', 'primaire', 30)",
    [schoolBId]
  );

  const [subjectA] = await conn.query(
    "INSERT INTO subjects (school_id, name, coefficient, class_id) VALUES (?, 'Mathématiques', 3, ?)",
    [schoolAId, classA.insertId]
  );
  const [subjectB] = await conn.query(
    "INSERT INTO subjects (school_id, name, coefficient, class_id) VALUES (?, 'Mathématiques', 3, ?)",
    [schoolBId, classB.insertId]
  );

  const [studentA] = await conn.query(
    "INSERT INTO students (school_id, matricule, first_name, last_name, gender, class_id, status) VALUES (?, 'ECO-A001', 'Eleve', 'A', 'M', ?, 'inscrit')",
    [schoolAId, classA.insertId]
  );
  const [studentB] = await conn.query(
    "INSERT INTO students (school_id, matricule, first_name, last_name, gender, class_id, status) VALUES (?, 'ECO-B001', 'Eleve', 'B', 'M', ?, 'inscrit')",
    [schoolBId, classB.insertId]
  );

  const [gradeA] = await conn.query(
    "INSERT INTO grades (student_id, subject_id, value, max_value, period, grade_type, created_by) VALUES (?, ?, 15, 20, 'trimestre1', 'devoir', ?)",
    [studentA.insertId, subjectA.insertId, users.teacherA]
  );
  const [gradeB] = await conn.query(
    "INSERT INTO grades (student_id, subject_id, value, max_value, period, grade_type, created_by) VALUES (?, ?, 12, 20, 'trimestre1', 'devoir', ?)",
    [studentB.insertId, subjectB.insertId, users.directorB]
  );

  const fixtures = {
    schoolAId, schoolBId,
    users,
    classAId: classA.insertId, classBId: classB.insertId,
    subjectAId: subjectA.insertId, subjectBId: subjectB.insertId,
    studentAId: studentA.insertId, studentBId: studentB.insertId,
    gradeAId: gradeA.insertId, gradeBId: gradeB.insertId,
    password: 'Test1234!',
  };
  fs.writeFileSync(path.join(__dirname, 'fixtures.json'), JSON.stringify(fixtures, null, 2));

  await conn.end();
};
