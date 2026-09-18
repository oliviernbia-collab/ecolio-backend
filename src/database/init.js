const mysql = require('mysql2/promise');
const bcrypt = require('bcryptjs');
const dotenv = require('dotenv');
const fs = require('fs');
const path = require('path');

dotenv.config({ path: path.join(__dirname, '../../.env') });

async function initDatabase() {
  let connection;
  try {
    // Connect without DB first to create it
    connection = await mysql.createConnection({
      host: process.env.DB_HOST || 'localhost',
      user: process.env.DB_USER || 'root',
      password: process.env.DB_PASSWORD || '',
      port: process.env.DB_PORT || 3306,
      multipleStatements: true
    });

    console.log('✅ Connexion MySQL établie');

    // Create DB and tables from schema
    const schema = fs.readFileSync(path.join(__dirname, 'schema.sql'), 'utf8');
    await connection.query(schema);
    console.log('✅ Schéma créé');

    await connection.query('USE ecolio');

    // Check if already seeded
    const [rows] = await connection.query('SELECT COUNT(*) as count FROM schools');
    if (rows[0].count > 0) {
      console.log('ℹ️  Base déjà initialisée. Seed ignoré.');
      return;
    }

    // Seed school
    const [schoolResult] = await connection.query(
      `INSERT INTO schools (name, address, phone, email, primary_color, secondary_color)
       VALUES ('École Primaire Albert Camus', '12 Rue des Acacias, Abidjan', '+225 27 22 41 00 00', 'contact@camus-abidjan.ci', '#1A3C5E', '#2E86AB')`
    );
    const schoolId = schoolResult.insertId;
    console.log('✅ École créée (id=' + schoolId + ')');

    // Seed academic year
    const [ayResult] = await connection.query(
      `INSERT INTO academic_years (school_id, name, start_date, end_date, is_current)
       VALUES (?, '2025-2026', '2025-09-01', '2026-06-30', 1)`,
      [schoolId]
    );
    const ayId = ayResult.insertId;

    // Seed users
    const hash = await bcrypt.hash('Admin1234!', 10);
    const teacherHash = await bcrypt.hash('Teacher1234!', 10);
    const parentHash = await bcrypt.hash('Parent1234!', 10);

    const [adminResult] = await connection.query(
      `INSERT INTO users (school_id, first_name, last_name, email, password, role)
       VALUES (?, 'Jean', 'Directeur', 'admin@ecolio.ci', ?, 'director')`,
      [schoolId, hash]
    );
    const adminId = adminResult.insertId;

    const [t1Result] = await connection.query(
      `INSERT INTO users (school_id, first_name, last_name, email, password, role)
       VALUES (?, 'Marie', 'Kouassi', 'marie.kouassi@ecolio.ci', ?, 'teacher')`,
      [schoolId, teacherHash]
    );
    const t1Id = t1Result.insertId;

    const [t2Result] = await connection.query(
      `INSERT INTO users (school_id, first_name, last_name, email, password, role)
       VALUES (?, 'Paul', 'Bamba', 'paul.bamba@ecolio.ci', ?, 'teacher')`,
      [schoolId, teacherHash]
    );
    const t2Id = t2Result.insertId;

    const [p1Result] = await connection.query(
      `INSERT INTO users (school_id, first_name, last_name, email, password, role, phone)
       VALUES (?, 'Kofi', 'Mensah', 'kofi.mensah@gmail.com', ?, 'parent', '+225 07 01 02 03')`,
      [schoolId, parentHash]
    );
    const p1Id = p1Result.insertId;

    const [p2Result] = await connection.query(
      `INSERT INTO users (school_id, first_name, last_name, email, password, role, phone)
       VALUES (?, 'Aya', 'Traoré', 'aya.traore@gmail.com', ?, 'parent', '+225 05 10 20 30')`,
      [schoolId, parentHash]
    );
    const p2Id = p2Result.insertId;

    // Accountant
    const [accResult] = await connection.query(
      `INSERT INTO users (school_id, first_name, last_name, email, password, role)
       VALUES (?, 'Fatou', 'Diallo', 'comptable@ecolio.ci', ?, 'accountant')`,
      [schoolId, hash]
    );

    // Secretary
    const [secResult] = await connection.query(
      `INSERT INTO users (school_id, first_name, last_name, email, password, role)
       VALUES (?, 'Adjoua', 'Yao', 'secretariat@ecolio.ci', ?, 'secretary')`,
      [schoolId, hash]
    );

    console.log('✅ Utilisateurs créés');

    // Seed classes
    const [cp] = await connection.query(
      `INSERT INTO classes (school_id, academic_year_id, name, level, cycle, teacher_id, capacity)
       VALUES (?, ?, 'CP-A', 'CP', 'primaire', ?, 30)`,
      [schoolId, ayId, t1Id]
    );
    const [ce1] = await connection.query(
      `INSERT INTO classes (school_id, academic_year_id, name, level, cycle, teacher_id, capacity)
       VALUES (?, ?, 'CE1-A', 'CE1', 'primaire', ?, 28)`,
      [schoolId, ayId, t2Id]
    );
    const [ce2] = await connection.query(
      `INSERT INTO classes (school_id, academic_year_id, name, level, cycle, teacher_id, capacity)
       VALUES (?, ?, 'CE2-A', 'CE2', 'primaire', ?, 25)`,
      [schoolId, ayId, t1Id]
    );
    const [cm1] = await connection.query(
      `INSERT INTO classes (school_id, academic_year_id, name, level, cycle, teacher_id, capacity)
       VALUES (?, ?, 'CM1-A', 'CM1', 'primaire', ?, 27)`,
      [schoolId, ayId, t2Id]
    );
    const cpId = cp.insertId;
    const ce1Id = ce1.insertId;
    const ce2Id = ce2.insertId;
    const cm1Id = cm1.insertId;
    console.log('✅ Classes créées');

    // Seed students
    const students = [
      ['ECO-001', 'Amara', 'Koné', '2018-03-15', 'Abidjan', 'M', cpId, p1Id],
      ['ECO-002', 'Fatoumata', 'Diabaté', '2018-07-22', 'Bouaké', 'F', cpId, p2Id],
      ['ECO-003', 'Ibrahim', 'Coulibaly', '2018-01-10', 'Abidjan', 'M', cpId, p1Id],
      ['ECO-004', 'Mariam', 'Bah', '2017-05-18', 'Yamoussoukro', 'F', ce1Id, p2Id],
      ['ECO-005', 'Oumar', 'Diarra', '2017-11-30', 'Abidjan', 'M', ce1Id, p1Id],
      ['ECO-006', 'Aissatou', 'Sanogo', '2017-08-12', 'Abidjan', 'F', ce1Id, p2Id],
      ['ECO-007', 'Mamadou', 'Traoré', '2016-04-25', 'Man', 'M', ce2Id, p1Id],
      ['ECO-008', 'Kadiatou', 'Camara', '2016-09-08', 'Abidjan', 'F', ce2Id, p2Id],
      ['ECO-009', 'Sékou', 'Touré', '2015-12-03', 'Abidjan', 'M', cm1Id, p1Id],
      ['ECO-010', 'Mariame', 'Konaté', '2015-06-17', 'Bouaké', 'F', cm1Id, p2Id],
      ['ECO-011', 'Abdoulaye', 'Diallo', '2015-02-28', 'Abidjan', 'M', cm1Id, p1Id],
      ['ECO-012', 'Fanta', 'Keita', '2018-10-05', 'Abidjan', 'F', cpId, p2Id],
    ];

    const studentIds = [];
    for (const s of students) {
      const [res] = await connection.query(
        `INSERT INTO students (school_id, academic_year_id, matricule, first_name, last_name, birth_date, birth_place, gender, class_id, parent_id, status)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'inscrit')`,
        [schoolId, ayId, s[0], s[1], s[2], s[3], s[4], s[5], s[6], s[7]]
      );
      studentIds.push(res.insertId);
    }
    console.log('✅ Élèves créés');

    // Seed subjects
    const subjectData = [
      ['Français', 'FR', 3.0, cpId, t1Id],
      ['Mathématiques', 'MATH', 3.0, cpId, t1Id],
      ['Éveil', 'EVEIL', 1.0, cpId, t1Id],
      ['Français', 'FR', 3.0, ce1Id, t2Id],
      ['Mathématiques', 'MATH', 3.0, ce1Id, t2Id],
      ['Sciences', 'SCI', 2.0, ce1Id, t2Id],
      ['Français', 'FR', 3.0, ce2Id, t1Id],
      ['Mathématiques', 'MATH', 3.0, ce2Id, t1Id],
      ['Histoire-Géo', 'HG', 2.0, ce2Id, t1Id],
      ['Français', 'FR', 3.0, cm1Id, t2Id],
      ['Mathématiques', 'MATH', 3.0, cm1Id, t2Id],
      ['Sciences', 'SCI', 2.0, cm1Id, t2Id],
    ];

    const subjectIds = [];
    for (const sub of subjectData) {
      const [res] = await connection.query(
        `INSERT INTO subjects (school_id, name, code, coefficient, class_id, teacher_id)
         VALUES (?, ?, ?, ?, ?, ?)`,
        [schoolId, ...sub]
      );
      subjectIds.push(res.insertId);
    }
    console.log('✅ Matières créées');

    // Seed grades for CP students (first 4 students)
    const cpStudentIds = studentIds.slice(0, 4);
    const cpSubjectIds = subjectIds.slice(0, 3); // FR, MATH, EVEIL for CP
    const periods = ['trimestre1', 'trimestre2'];

    for (const sid of cpStudentIds) {
      for (const subId of cpSubjectIds) {
        for (const period of periods) {
          const val = (Math.random() * 10 + 10).toFixed(2);
          await connection.query(
            `INSERT INTO grades (student_id, subject_id, academic_year_id, value, max_value, period, grade_type, created_by)
             VALUES (?, ?, ?, ?, 20, ?, 'composition', ?)`,
            [sid, subId, ayId, val, period, t1Id]
          );
        }
      }
    }

    // Seed CE1 grades
    const ce1StudentIds = studentIds.slice(3, 6);
    const ce1SubjectIds = subjectIds.slice(3, 6);
    for (const sid of ce1StudentIds) {
      for (const subId of ce1SubjectIds) {
        for (const period of periods) {
          const val = (Math.random() * 12 + 8).toFixed(2);
          await connection.query(
            `INSERT INTO grades (student_id, subject_id, academic_year_id, value, max_value, period, grade_type, created_by)
             VALUES (?, ?, ?, ?, 20, ?, 'composition', ?)`,
            [sid, subId, ayId, val, period, t2Id]
          );
        }
      }
    }
    console.log('✅ Notes créées');

    // Seed attendance (last 10 school days)
    const today = new Date();
    const allStudentIds = studentIds;
    const classMap = {
      [cpId]: studentIds.slice(0, 4),
      [ce1Id]: studentIds.slice(3, 6),
      [ce2Id]: studentIds.slice(6, 8),
      [cm1Id]: studentIds.slice(8, 11),
    };

    for (let d = 9; d >= 0; d--) {
      const date = new Date(today);
      date.setDate(date.getDate() - d);
      const dow = date.getDay();
      if (dow === 0 || dow === 6) continue; // skip weekends
      const dateStr = date.toISOString().split('T')[0];

      for (const [clsId, sIds] of Object.entries(classMap)) {
        for (const sid of sIds) {
          const rand = Math.random();
          const status = rand > 0.9 ? 'absent' : rand > 0.85 ? 'retard' : 'present';
          try {
            await connection.query(
              `INSERT IGNORE INTO attendance (student_id, class_id, date, status, justified, recorded_by)
               VALUES (?, ?, ?, ?, ?, ?)`,
              [sid, clsId, dateStr, status, status === 'absent' && Math.random() > 0.5 ? 1 : 0, t1Id]
            );
          } catch (e) {}
        }
      }
    }
    console.log('✅ Présences créées');

    // Seed rooms
    await connection.query(
      `INSERT INTO rooms (school_id, name, type, capacity) VALUES
       (?, 'Salle 101', 'classe', 30),
       (?, 'Salle 102', 'classe', 28),
       (?, 'Salle Informatique', 'informatique', 20),
       (?, 'Gymnase', 'sport', 50),
       (?, 'Laboratoire', 'labo', 25)`,
      [schoolId, schoolId, schoolId, schoolId, schoolId]
    );

    // Seed schedule
    const scheduleData = [
      [cpId, subjectIds[0], t1Id, 1, '08:00:00', '09:00:00'],
      [cpId, subjectIds[1], t1Id, 1, '09:00:00', '10:00:00'],
      [cpId, subjectIds[0], t1Id, 2, '08:00:00', '09:00:00'],
      [cpId, subjectIds[2], t1Id, 3, '10:00:00', '11:00:00'],
      [ce1Id, subjectIds[3], t2Id, 1, '08:00:00', '09:00:00'],
      [ce1Id, subjectIds[4], t2Id, 1, '09:00:00', '10:00:00'],
      [ce1Id, subjectIds[5], t2Id, 2, '10:00:00', '11:00:00'],
    ];
    for (const s of scheduleData) {
      await connection.query(
        `INSERT INTO schedule (school_id, class_id, subject_id, teacher_id, day_of_week, start_time, end_time, academic_year_id)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
        [schoolId, s[0], s[1], s[2], s[3], s[4], s[5], ayId]
      );
    }
    console.log('✅ Emploi du temps créé');

    // Seed staff
    await connection.query(
      `INSERT INTO staff (school_id, user_id, position, contract_type, hire_date, salary)
       VALUES
       (?, ?, 'Directeur', 'CDI', '2018-09-01', 450000),
       (?, ?, 'Enseignante CP/CE2', 'CDI', '2020-09-01', 280000),
       (?, ?, 'Enseignant CE1/CM1', 'CDI', '2021-09-01', 280000),
       (?, ?, 'Secrétaire', 'CDI', '2022-09-01', 180000)`,
      [schoolId, adminId, schoolId, t1Id, schoolId, t2Id, schoolId, secResult.insertId]
    );
    console.log('✅ Personnel créé');

    // Seed invoices
    const invoiceStudents = studentIds.slice(0, 8);
    const amounts = [150000, 150000, 150000, 150000, 175000, 175000, 200000, 200000];
    const statuses = ['paid', 'paid', 'paid', 'pending', 'paid', 'overdue', 'paid', 'pending'];
    for (let i = 0; i < invoiceStudents.length; i++) {
      const invNum = `ECO-2026-${String(i + 1).padStart(4, '0')}`;
      const paidAt = statuses[i] === 'paid' ? '2025-10-15 10:00:00' : null;
      await connection.query(
        `INSERT INTO invoices (school_id, student_id, invoice_number, amount, description, due_date, status, payment_method, paid_at)
         VALUES (?, ?, ?, ?, 'Frais de scolarité T1 2025-2026', '2025-10-31', ?, ?, ?)`,
        [schoolId, invoiceStudents[i], invNum, amounts[i], statuses[i], statuses[i] === 'paid' ? 'Mobile Money' : null, paidAt]
      );
    }
    console.log('✅ Factures créées');

    // Seed messages
    const [msg1] = await connection.query(
      `INSERT INTO messages (school_id, sender_id, subject, content)
       VALUES (?, ?, ?, ?)`,
      [schoolId, adminId, "Réunion parents d'élèves", 'Chers parents, nous vous invitons à la réunion parents-professeurs le vendredi 28 juin 2026 à 16h00 dans la grande salle.']
    );
    await connection.query(
      `INSERT INTO message_recipients (message_id, recipient_id) VALUES (?, ?), (?, ?)`,
      [msg1.insertId, p1Id, msg1.insertId, p2Id]
    );

    const [msg2] = await connection.query(
      `INSERT INTO messages (school_id, sender_id, subject, content)
       VALUES (?, ?, ?, ?)`,
      [schoolId, t1Id, 'Résultats du 2ème trimestre', "Les bulletins du 2ème trimestre sont disponibles dans l'application. Veuillez les consulter."]
    );
    await connection.query(
      `INSERT INTO message_recipients (message_id, recipient_id) VALUES (?, ?), (?, ?)`,
      [msg2.insertId, p1Id, msg2.insertId, p2Id]
    );
    console.log('✅ Messages créés');

    // Seed notifications
    await connection.query(
      `INSERT INTO notifications (user_id, school_id, title, content, type) VALUES
       (?, ?, ?, ?, 'absence'),
       (?, ?, ?, ?, 'grade'),
       (?, ?, ?, ?, 'finance')`,
      [
        p1Id, schoolId, 'Absence signalée', 'Amara Koné était absent aujourd\'hui.',
        p1Id, schoolId, 'Nouveau bulletin', "Le bulletin du T2 d'Amara est disponible.",
        p1Id, schoolId, 'Facture impayée', 'La facture ECO-2026-0004 est en attente de paiement.'
      ]
    );
    console.log('✅ Notifications créées');

    console.log('\n\x1b[32m🎉 Base de données Écolio initialisée avec succès!\x1b[0m');
    console.log('\n📋 Comptes de démonstration:');
    console.log('  Directeur : admin@ecolio.ci / Admin1234!');
    console.log('  Enseignant: marie.kouassi@ecolio.ci / Teacher1234!');
    console.log('  Parent    : kofi.mensah@gmail.com / Parent1234!');
    console.log('  Comptable : comptable@ecolio.ci / Admin1234!');
    console.log('  Secrétariat : secretariat@ecolio.ci / Admin1234!');

  } catch (err) {
    console.error('\x1b[31m❌ Erreur:', err.message, '\x1b[0m');
    process.exit(1);
  } finally {
    if (connection) await connection.end();
  }
}

initDatabase();
