// Seed complet pour l'école OliTech (school_id existant) — couvre TOUS les modules
// pour permettre à l'utilisateur de tester l'application de bout en bout.
// Usage : node src/database/seed_olitech.js
// Idempotent : si OliTech a déjà des classes, le script s'arrête sans rien dupliquer.

const mysql = require('mysql2/promise');
const bcrypt = require('bcryptjs');
const dotenv = require('dotenv');
const path = require('path');

dotenv.config({ path: path.join(__dirname, '../../.env') });

const SCHOOL_NAME = 'OliTech';
const PASSWORD = 'OliTech1234!';

async function seed() {
  let conn;
  try {
    conn = await mysql.createConnection({
      host: process.env.DB_HOST || 'localhost',
      user: process.env.DB_USER || 'root',
      password: process.env.DB_PASSWORD || '',
      port: process.env.DB_PORT || 3306,
      database: 'ecolio',
      multipleStatements: false,
    });

    const [schoolRows] = await conn.query('SELECT id FROM schools WHERE name = ?', [SCHOOL_NAME]);
    if (!schoolRows.length) {
      console.error(`❌ École "${SCHOOL_NAME}" introuvable. Créez-la d'abord (inscription ou SQL).`);
      process.exit(1);
    }
    const schoolId = schoolRows[0].id;

    const [existingClasses] = await conn.query('SELECT COUNT(*) as c FROM classes WHERE school_id=?', [schoolId]);
    if (existingClasses[0].c > 0) {
      console.log(`ℹ️  OliTech (id=${schoolId}) a déjà des classes. Seed ignoré pour éviter les doublons.`);
      console.log('   Pour reseeder, supprimez d\'abord ses données (classes/students/staff/...) puis relancez.');
      return;
    }

    console.log(`✅ École cible : OliTech (id=${schoolId})`);

    // S'assurer que l'école est active et l'essai/abonnement valide (sinon le 402 bloque tout test)
    await conn.query(
      `UPDATE schools SET is_active=1, trial_ends_at=GREATEST(COALESCE(trial_ends_at, NOW()), DATE_ADD(NOW(), INTERVAL 60 DAY)) WHERE id=?`,
      [schoolId]
    );

    // ─── Année scolaire ────────────────────────────────────────────────────
    const [ayRes] = await conn.query(
      `INSERT INTO academic_years (school_id, name, start_date, end_date, is_current) VALUES (?, '2025-2026', '2025-09-01', '2026-06-30', 1)`,
      [schoolId]
    );
    const ayId = ayRes.insertId;
    console.log('✅ Année scolaire 2025-2026 créée');

    const hash = await bcrypt.hash(PASSWORD, 10);
    const mkUser = async (first, last, email, role, phone = null) => {
      const [r] = await conn.query(
        `INSERT INTO users (school_id, first_name, last_name, email, password, role, phone, is_active) VALUES (?,?,?,?,?,?,?,1)`,
        [schoolId, first, last, email, hash, role, phone]
      );
      return r.insertId;
    };

    // ─── Personnel ─────────────────────────────────────────────────────────
    const directorId = (await conn.query('SELECT id FROM users WHERE school_id=? AND role=?', [schoolId, 'director']))[0][0]?.id
      || await mkUser('Olivier', 'Directeur', 'direction@olitech.ci', 'director', '+225 07 00 00 01');

    const tMaternelle = await mkUser('Kouadio', 'Yao', 'kouadio.yao@olitech.ci', 'teacher', '+225 07 10 10 01');
    const tPrimaire   = await mkUser('Awa', 'Cissé', 'awa.cisse@olitech.ci', 'teacher', '+225 07 10 10 02');
    const tSecondaire = await mkUser('Julien', "N'Guessan", 'julien.nguessan@olitech.ci', 'teacher', '+225 07 10 10 03');
    const accountantId = await mkUser('Chantal', 'Boni', 'chantal.boni@olitech.ci', 'accountant', '+225 07 10 10 04');
    const secretaryId  = await mkUser('Aminata', 'Sy', 'aminata.sy@olitech.ci', 'secretary', '+225 07 10 10 05');
    const librarianId  = await mkUser('Serge', 'Kouamé', 'serge.kouame@olitech.ci', 'librarian', '+225 07 10 10 06');
    const nurseId       = await mkUser('Ruth', 'Anoh', 'ruth.anoh@olitech.ci', 'nurse', '+225 07 10 10 07');
    const counselorId   = await mkUser('Bakary', 'Sidibé', 'bakary.sidibe@olitech.ci', 'counselor', '+225 07 10 10 08');
    const maintenanceId = await mkUser('Moussa', 'Fofana', 'moussa.fofana@olitech.ci', 'maintenance', '+225 07 10 10 09');
    console.log('✅ Personnel créé (3 enseignants + comptable + secrétaire + bibliothécaire + infirmière + CPE + maintenance)');

    // ─── Parents ───────────────────────────────────────────────────────────
    const parent1 = await mkUser('Georges', 'Kouassi', 'georges.kouassi@gmail.com', 'parent', '+225 07 20 20 01');
    const parent2 = await mkUser('Henriette', 'Aké', 'henriette.ake@gmail.com', 'parent', '+225 07 20 20 02');
    const parent3 = await mkUser('Ismaël', 'Ouattara', 'ismael.ouattara@gmail.com', 'parent', '+225 07 20 20 03');
    const parent4 = await mkUser('Nadège', 'Brou', 'nadege.brou@gmail.com', 'parent', '+225 07 20 20 04');
    console.log('✅ Parents créés');

    // ─── Staff (fiches RH) ─────────────────────────────────────────────────
    const staffData = [
      [directorId, 'Directeur', 'CDI', '2022-09-01', 500000],
      [tMaternelle, 'Enseignante Maternelle', 'CDI', '2023-09-01', 250000],
      [tPrimaire, 'Enseignante Primaire', 'CDI', '2022-09-01', 260000],
      [tSecondaire, 'Enseignant Secondaire', 'CDI', '2023-09-01', 290000],
      [accountantId, 'Comptable', 'CDI', '2023-01-15', 220000],
      [secretaryId, 'Secrétaire', 'CDD', '2024-09-01', 170000],
      [librarianId, 'Bibliothécaire', 'CDI', '2023-09-01', 160000],
      [nurseId, 'Infirmière scolaire', 'CDI', '2023-09-01', 200000],
      [counselorId, "Conseiller d'éducation", 'CDI', '2022-09-01', 230000],
      [maintenanceId, 'Agent de maintenance', 'vacataire', '2024-01-10', 120000],
    ];
    const staffIdByUser = {};
    for (const [userId, position, contract, hireDate, salary] of staffData) {
      const [r] = await conn.query(
        `INSERT INTO staff (school_id, user_id, position, contract_type, hire_date, salary) VALUES (?,?,?,?,?,?)`,
        [schoolId, userId, position, contract, hireDate, salary]
      );
      staffIdByUser[userId] = r.insertId;
    }
    console.log('✅ Fiches personnel (RH) créées');

    // ─── Classes (3 cycles) ────────────────────────────────────────────────
    const classDefs = [
      ['PS-A', 'Petite Section', 'maternelle', tMaternelle, 20],
      ['CP-A', 'CP', 'primaire', tPrimaire, 28],
      ['CM2-A', 'CM2', 'primaire', tPrimaire, 26],
      ['6e-A', '6ème', 'secondaire', tSecondaire, 32],
      ['3e-A', '3ème', 'secondaire', tSecondaire, 30],
    ];
    const classIds = {};
    for (const [name, level, cycle, teacherId, capacity] of classDefs) {
      const [r] = await conn.query(
        `INSERT INTO classes (school_id, academic_year_id, name, level, cycle, teacher_id, capacity) VALUES (?,?,?,?,?,?,?)`,
        [schoolId, ayId, name, level, cycle, teacherId, capacity]
      );
      classIds[name] = r.insertId;
    }
    console.log('✅ Classes créées (maternelle/primaire/secondaire)');

    // ─── Élèves + parents ──────────────────────────────────────────────────
    const studentDefs = [
      // matricule, prénom, nom, naissance, lieu, genre, classe, parent
      ['OLI-001', 'Kevin', 'Kouassi', '2021-03-12', 'Abidjan', 'M', 'PS-A', parent1],
      ['OLI-002', 'Grace', 'Aké', '2021-06-02', 'Abidjan', 'F', 'PS-A', parent2],
      ['OLI-003', 'Yannick', 'Ouattara', '2021-01-20', 'Yamoussoukro', 'M', 'PS-A', parent3],
      ['OLI-004', 'Prisca', 'Brou', '2018-09-14', 'Abidjan', 'F', 'CP-A', parent4],
      ['OLI-005', 'Steven', 'Kouassi', '2018-02-08', 'Abidjan', 'M', 'CP-A', parent1],
      ['OLI-006', 'Divine', 'Aké', '2018-11-27', 'Bouaké', 'F', 'CP-A', parent2],
      ['OLI-007', 'Junior', 'Ouattara', '2018-05-19', 'Abidjan', 'M', 'CP-A', parent3],
      ['OLI-008', 'Emmanuella', 'Brou', '2015-08-03', 'Abidjan', 'F', 'CM2-A', parent4],
      ['OLI-009', 'Rayan', 'Kouassi', '2015-04-16', 'Daloa', 'M', 'CM2-A', parent1],
      ['OLI-010', 'Chloé', 'Aké', '2015-12-22', 'Abidjan', 'F', 'CM2-A', parent2],
      ['OLI-011', 'Wilfried', 'Ouattara', '2015-07-09', 'Abidjan', 'M', 'CM2-A', parent3],
      ['OLI-012', 'Cynthia', 'Brou', '2013-10-30', 'Abidjan', 'F', '6e-A', parent4],
      ['OLI-013', 'Aaron', 'Kouassi', '2013-03-05', 'Abidjan', 'M', '6e-A', parent1],
      ['OLI-014', 'Bénédicte', 'Aké', '2013-09-17', 'San Pédro', 'F', '6e-A', parent2],
      ['OLI-015', 'Christian', 'Ouattara', '2011-01-11', 'Abidjan', 'M', '3e-A', parent3],
      ['OLI-016', 'Daphné', 'Brou', '2011-06-25', 'Abidjan', 'F', '3e-A', parent4],
      ['OLI-017', 'Eddy', 'Kouassi', '2011-04-02', 'Korhogo', 'M', '3e-A', parent1],
    ];
    const studentIds = {};
    const studentsByClass = {};
    for (const [mat, first, last, dob, place, gender, cls, parentId] of studentDefs) {
      const [r] = await conn.query(
        `INSERT INTO students (school_id, academic_year_id, matricule, first_name, last_name, birth_date, birth_place, gender, class_id, parent_id, status)
         VALUES (?,?,?,?,?,?,?,?,?,?, 'inscrit')`,
        [schoolId, ayId, mat, first, last, dob, place, gender, classIds[cls], parentId]
      );
      studentIds[mat] = r.insertId;
      (studentsByClass[cls] ||= []).push(r.insertId);
    }
    console.log('✅ 17 élèves créés (répartis sur 5 classes, 4 familles)');

    // Un compte élève (portail) pour tester le portail élève
    const studentPortalHash = await bcrypt.hash(PASSWORD, 10);
    const [studentUserRes] = await conn.query(
      `INSERT INTO users (school_id, first_name, last_name, email, password, role, student_id, is_active) VALUES (?,?,?,?,?,?,?,1)`,
      [schoolId, 'Aaron', 'Kouassi', 'aaron.kouassi@olitech-eleve.ci', studentPortalHash, 'student', studentIds['OLI-013']]
    );
    console.log('✅ Compte portail élève créé (aaron.kouassi@olitech-eleve.ci)');

    // ─── Matières ──────────────────────────────────────────────────────────
    const subjectDefs = [
      ['Éveil', 'EVEIL', 1.0, 'PS-A', tMaternelle],
      ['Graphisme', 'GRAPH', 1.0, 'PS-A', tMaternelle],
      ['Français', 'FR', 3.0, 'CP-A', tPrimaire],
      ['Mathématiques', 'MATH', 3.0, 'CP-A', tPrimaire],
      ['Sciences', 'SCI', 2.0, 'CP-A', tPrimaire],
      ['Français', 'FR', 3.0, 'CM2-A', tPrimaire],
      ['Mathématiques', 'MATH', 3.0, 'CM2-A', tPrimaire],
      ['Histoire-Géo', 'HG', 2.0, 'CM2-A', tPrimaire],
      ['Français', 'FR', 3.0, '6e-A', tSecondaire],
      ['Mathématiques', 'MATH', 4.0, '6e-A', tSecondaire],
      ['Anglais', 'ANG', 2.0, '6e-A', tSecondaire],
      ['SVT', 'SVT', 2.0, '6e-A', tSecondaire],
      ['Français', 'FR', 3.0, '3e-A', tSecondaire],
      ['Mathématiques', 'MATH', 4.0, '3e-A', tSecondaire],
      ['Physique-Chimie', 'PC', 3.0, '3e-A', tSecondaire],
      ['Anglais', 'ANG', 2.0, '3e-A', tSecondaire],
    ];
    const subjectIdsByClass = {};
    for (const [name, code, coef, cls, teacherId] of subjectDefs) {
      const [r] = await conn.query(
        `INSERT INTO subjects (school_id, name, code, coefficient, class_id, teacher_id) VALUES (?,?,?,?,?,?)`,
        [schoolId, name, code, coef, classIds[cls], teacherId]
      );
      (subjectIdsByClass[cls] ||= []).push(r.insertId);
    }
    console.log('✅ Matières créées par classe');

    // ─── Salles ────────────────────────────────────────────────────────────
    const [roomRes] = await conn.query(
      `INSERT INTO rooms (school_id, name, type, capacity) VALUES (?,'Salle A1','classe',30),(?,'Salle A2','classe',30),(?,'Salle Info','informatique',24),(?,'Terrain de sport','sport',60)`,
      [schoolId, schoolId, schoolId, schoolId]
    );
    const [rooms] = await conn.query('SELECT id, name FROM rooms WHERE school_id=? ORDER BY id', [schoolId]);
    console.log('✅ Salles créées');

    // ─── Emploi du temps ───────────────────────────────────────────────────
    for (const cls of ['CP-A', 'CM2-A', '6e-A', '3e-A']) {
      const subs = subjectIdsByClass[cls];
      const teacherId = cls.startsWith('C') ? tPrimaire : tSecondaire;
      await conn.query(
        `INSERT INTO schedule (school_id, class_id, subject_id, teacher_id, day_of_week, start_time, end_time, room_id, academic_year_id) VALUES
         (?,?,?,?,1,'08:00:00','09:00:00',?,?),
         (?,?,?,?,1,'09:00:00','10:00:00',?,?),
         (?,?,?,?,2,'08:00:00','09:00:00',?,?)`,
        [
          schoolId, classIds[cls], subs[0], teacherId, rooms[0].id, ayId,
          schoolId, classIds[cls], subs[1], teacherId, rooms[0].id, ayId,
          schoolId, classIds[cls], subs[0], teacherId, rooms[1].id, ayId,
        ]
      );
    }
    console.log('✅ Emploi du temps créé');

    // ─── Notes (trimestre1 + trimestre2) ───────────────────────────────────
    const gradeableClasses = ['CP-A', 'CM2-A', '6e-A', '3e-A'];
    for (const cls of gradeableClasses) {
      const teacherId = cls.startsWith('C') ? tPrimaire : tSecondaire;
      for (const sid of studentsByClass[cls]) {
        for (const subId of subjectIdsByClass[cls]) {
          for (const period of ['trimestre1', 'trimestre2']) {
            const val = (Math.random() * 9 + 10).toFixed(2); // 10 à 19
            await conn.query(
              `INSERT INTO grades (student_id, subject_id, academic_year_id, value, max_value, period, grade_type, created_by) VALUES (?,?,?,?,20,?,'composition',?)`,
              [sid, subId, ayId, val, period, teacherId]
            );
          }
        }
      }
    }
    console.log('✅ Notes créées (trimestre1 + trimestre2)');

    // ─── Présences (10 derniers jours ouvrés) ──────────────────────────────
    const today = new Date();
    for (let d = 13; d >= 0; d--) {
      const date = new Date(today);
      date.setDate(date.getDate() - d);
      const dow = date.getDay();
      if (dow === 0 || dow === 6) continue;
      const dateStr = date.toISOString().split('T')[0];
      for (const cls of Object.keys(studentsByClass)) {
        for (const sid of studentsByClass[cls]) {
          const rand = Math.random();
          const status = rand > 0.9 ? 'absent' : rand > 0.85 ? 'retard' : 'present';
          try {
            await conn.query(
              `INSERT IGNORE INTO attendance (student_id, class_id, date, status, justified, recorded_by) VALUES (?,?,?,?,?,?)`,
              [sid, classIds[cls], dateStr, status, status === 'absent' && Math.random() > 0.5 ? 1 : 0, tPrimaire]
            );
          } catch (_) {}
        }
      }
    }
    console.log('✅ Présences créées (14 derniers jours)');

    // ─── Examens + surveillants ────────────────────────────────────────────
    const examDefs = [
      ['Composition Trimestre 1', 'CM2-A', 0, 'trimestre1', -20, 'termine'],
      ['Devoir surveillé Maths', '3e-A', 1, 'trimestre1', -10, 'termine'],
      ['Composition Trimestre 2', '6e-A', 1, 'trimestre2', 7, 'planifie'],
    ];
    for (const [title, cls, subIdx, period, dayOffset, status] of examDefs) {
      const d = new Date(today); d.setDate(d.getDate() + dayOffset);
      const examDate = d.toISOString().split('T')[0];
      const teacherId = cls.startsWith('C') ? tPrimaire : tSecondaire;
      const [examRes] = await conn.query(
        `INSERT INTO exams (school_id, academic_year_id, class_id, subject_id, title, exam_date, start_time, end_time, room_id, period, max_value, status, created_by)
         VALUES (?,?,?,?,?,?, '08:00:00','10:00:00', ?, ?, 20, ?, ?)`,
        [schoolId, ayId, classIds[cls], subjectIdsByClass[cls][subIdx], title, examDate, rooms[2].id, period, status, teacherId]
      );
      await conn.query(`INSERT IGNORE INTO exam_supervisors (exam_id, teacher_id) VALUES (?,?)`, [examRes.insertId, teacherId]);
    }
    console.log('✅ Examens créés');

    // ─── Pointages du personnel (5 derniers jours) ─────────────────────────
    const staffMemberIds = Object.values(staffIdByUser);
    for (let d = 4; d >= 0; d--) {
      const date = new Date(today); date.setDate(date.getDate() - d);
      const dow = date.getDay();
      if (dow === 0 || dow === 6) continue;
      const dateStr = date.toISOString().split('T')[0];
      for (const sId of staffMemberIds) {
        const late = Math.random() > 0.85;
        try {
          await conn.query(
            `INSERT IGNORE INTO staff_attendance (school_id, staff_id, date, check_in_time, check_out_time, status, recorded_by) VALUES (?,?,?,?,?,?,?)`,
            [schoolId, sId, dateStr, late ? '08:20:00' : '07:55:00', '16:30:00', late ? 'retard' : 'present', secretaryId]
          );
        } catch (_) {}
      }
    }
    console.log('✅ Pointages du personnel créés');

    // ─── Paye (2 mois) ──────────────────────────────────────────────────────
    const now = new Date();
    const thisMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
    const prevD = new Date(now.getFullYear(), now.getMonth() - 1, 1);
    const prevMonth = `${prevD.getFullYear()}-${String(prevD.getMonth() + 1).padStart(2, '0')}`;
    for (const [userId, , , , baseSalary] of staffData) {
      const sId = staffIdByUser[userId];
      for (const [month, paid] of [[prevMonth, true], [thisMonth, false]]) {
        const bonuses = Math.random() > 0.7 ? 15000 : 0;
        const net = baseSalary + bonuses;
        const ref = `PAY-${month.replace('-', '')}-${sId}`;
        await conn.query(
          `INSERT IGNORE INTO payslips (school_id, staff_id, period_month, reference, base_salary, bonuses, net_amount, status, payment_method, paid_at, generated_by)
           VALUES (?,?,?,?,?,?,?,?,?,?,?)`,
          [schoolId, sId, month, ref, baseSalary, bonuses, net, paid ? 'paid' : 'draft', paid ? 'Virement bancaire' : null, paid ? `${prevMonth}-28 10:00:00` : null, accountantId]
        );
      }
    }
    console.log('✅ Bulletins de paie créés (2 mois)');

    // ─── Finance / factures ─────────────────────────────────────────────────
    const allStudentIds = Object.values(studentIds);
    const statuses = ['paid', 'paid', 'paid', 'pending', 'pending', 'overdue', 'paid', 'pending', 'paid', 'overdue'];
    for (let i = 0; i < 10; i++) {
      const sid = allStudentIds[i];
      const status = statuses[i];
      const amount = 100000 + (i % 4) * 25000;
      const invNum = `OLI-2026-${String(i + 1).padStart(4, '0')}`;
      await conn.query(
        `INSERT INTO invoices (school_id, student_id, invoice_number, amount, description, due_date, status, payment_method, paid_at)
         VALUES (?,?,?,?,?,?,?,?,?)`,
        [schoolId, sid, invNum, amount, 'Frais de scolarité Trimestre 1', '2025-11-15', status,
         status === 'paid' ? 'Wave' : null, status === 'paid' ? '2025-10-20 09:00:00' : null]
      );
    }
    console.log('✅ Factures créées (payées / en attente / en retard)');

    // ─── Messagerie ─────────────────────────────────────────────────────────
    const [m1] = await conn.query(
      `INSERT INTO messages (school_id, sender_id, subject, content) VALUES (?,?,?,?)`,
      [schoolId, directorId, "Réunion de rentrée", "Chers parents, une réunion de rentrée se tiendra le samedi 27 septembre à 9h en salle A1."]
    );
    await conn.query(`INSERT INTO message_recipients (message_id, recipient_id) VALUES (?,?),(?,?),(?,?)`,
      [m1.insertId, parent1, m1.insertId, parent2, m1.insertId, parent3]);

    const [m2] = await conn.query(
      `INSERT INTO messages (school_id, sender_id, subject, content) VALUES (?,?,?,?)`,
      [schoolId, tPrimaire, 'Sortie pédagogique CM2', "La classe de CM2-A visitera le musée des civilisations le 3 octobre. Merci d'apporter l'autorisation signée."]
    );
    await conn.query(`INSERT INTO message_recipients (message_id, recipient_id) VALUES (?,?),(?,?)`,
      [m2.insertId, parent1, m2.insertId, parent2]);
    console.log('✅ Messages créés');

    // ─── SMS (journal, mode simulation) ────────────────────────────────────
    const [smsPhones] = await conn.query(
      `SELECT id, phone FROM users WHERE school_id=? AND role='parent' AND phone IS NOT NULL`, [schoolId]
    );
    const [smsLogRes] = await conn.query(
      `INSERT INTO sms_logs (school_id, sender_id, recipient_group, trigger_type, content, recipient_count, sent_count, failed_count, status, provider)
       VALUES (?,?,?,?,?,?,?,0,'sent','mock')`,
      [schoolId, secretaryId, 'all_parents', 'manuel', 'Rappel : réunion de rentrée samedi 9h en salle A1.', smsPhones.length, smsPhones.length]
    );
    for (const p of smsPhones) {
      await conn.query(`INSERT INTO sms_recipients (sms_log_id, user_id, phone, status) VALUES (?,?,?,'sent')`, [smsLogRes.insertId, p.id, p.phone]);
    }
    console.log('✅ Historique SMS créé (fournisseur simulé)');

    // ─── Bibliothèque ───────────────────────────────────────────────────────
    const bookDefs = [
      ['Le Petit Prince', 'Antoine de Saint-Exupéry', '9782070408504', 'Roman', 5],
      ['Une vie de boy', 'Ferdinand Oyono', '9782266037937', 'Littérature africaine', 3],
      ['Mathématiques 6e', 'Collection Hachette', '9782010000001', 'Manuel scolaire', 10],
      ['Atlas du monde', 'Larousse', '9782035000002', 'Référence', 4],
      ['Contes de la savane', 'Amadou Hampâté Bâ', '9782020000003', 'Contes', 6],
      ['Physique-Chimie 3e', 'Collection Nathan', '9782090000004', 'Manuel scolaire', 8],
    ];
    const bookIds = [];
    for (const [title, author, isbn, category, total] of bookDefs) {
      const [r] = await conn.query(
        `INSERT INTO books (school_id, title, author, isbn, category, total_copies, available_copies) VALUES (?,?,?,?,?,?,?)`,
        [schoolId, title, author, isbn, category, total, total]
      );
      bookIds.push(r.insertId);
    }
    const loanDefs = [
      [bookIds[0], studentIds['OLI-012'], null, -10, -3, null, 'emprunte'],
      [bookIds[1], studentIds['OLI-015'], null, -20, -6, -4, 'rendu'],
      [bookIds[2], studentIds['OLI-009'], null, -25, -11, null, 'perdu'],
      [bookIds[4], studentIds['OLI-013'], null, -30, -16, null, 'emprunte'], // en retard (due_date passée)
      [bookIds[5], null, staffIdByUser[tSecondaire], -5, 9, null, 'emprunte'],
    ];
    for (const [bookId, studentId, staffId, borrowOffset, dueOffset, returnOffset, status] of loanDefs) {
      const b = new Date(today); b.setDate(b.getDate() + borrowOffset);
      const due = new Date(today); due.setDate(due.getDate() + dueOffset);
      const ret = returnOffset !== null ? (() => { const r = new Date(today); r.setDate(r.getDate() + returnOffset); return r.toISOString().split('T')[0]; })() : null;
      await conn.query(
        `INSERT INTO book_loans (school_id, book_id, student_id, staff_id, borrowed_at, due_date, returned_at, status, recorded_by)
         VALUES (?,?,?,?,?,?,?,?,?)`,
        [schoolId, bookId, studentId, staffId, b.toISOString().split('T')[0], due.toISOString().split('T')[0], ret, status, librarianId]
      );
      if (status === 'emprunte' || status === 'perdu') {
        await conn.query('UPDATE books SET available_copies = GREATEST(available_copies - 1, 0) WHERE id=?', [bookId]);
      }
    }
    console.log('✅ Bibliothèque créée (livres + emprunts, dont un en retard)');

    // ─── Infirmerie ─────────────────────────────────────────────────────────
    const healthDefs = [
      [studentIds['OLI-004'], 'Maux de ventre', 'Repos 30 min, a bu de l\'eau', 37.2, 0],
      [studentIds['OLI-009'], 'Chute dans la cour', 'Désinfection genou, pansement', 36.8, 0],
      [studentIds['OLI-002'], 'Fièvre', 'Prise de température, appel du parent', 38.6, 1],
    ];
    for (const [sid, reason, treatment, temp, sentHome] of healthDefs) {
      await conn.query(
        `INSERT INTO health_visits (school_id, student_id, reason, treatment, temperature, sent_home, recorded_by) VALUES (?,?,?,?,?,?,?)`,
        [schoolId, sid, reason, treatment, temp, sentHome, nurseId]
      );
    }
    console.log('✅ Visites infirmerie créées');

    // ─── Cantine / Transport ────────────────────────────────────────────────
    const [cantineRes] = await conn.query(
      `INSERT INTO services (school_id, type, name, description, price) VALUES (?,'cantine','Cantine scolaire','Déjeuner chaud du lundi au vendredi',25000)`, [schoolId]);
    const [transportRes] = await conn.query(
      `INSERT INTO services (school_id, type, name, description, price) VALUES (?,'transport','Bus scolaire - Ligne Cocody','Ramassage matin et soir',20000)`, [schoolId]);
    const subDefs = [
      [cantineRes.insertId, studentIds['OLI-001'], 'active'],
      [cantineRes.insertId, studentIds['OLI-004'], 'active'],
      [cantineRes.insertId, studentIds['OLI-012'], 'suspendu'],
      [transportRes.insertId, studentIds['OLI-005'], 'active'],
      [transportRes.insertId, studentIds['OLI-015'], 'termine'],
    ];
    for (const [serviceId, sid, status] of subDefs) {
      await conn.query(
        `INSERT INTO service_subscriptions (school_id, service_id, student_id, start_date, end_date, status, created_by) VALUES (?,?,?,?,?,?,?)`,
        [schoolId, serviceId, sid, '2025-09-01', status === 'termine' ? '2026-01-15' : null, status, secretaryId]
      );
    }
    console.log('✅ Services cantine/transport créés');

    // ─── Tableau d'honneur ──────────────────────────────────────────────────
    const [[cm2Best]] = await conn.query(
      `SELECT g.student_id, AVG(g.value) as avg FROM grades g WHERE g.student_id IN (?) AND g.period='trimestre1' GROUP BY g.student_id ORDER BY avg DESC LIMIT 1`,
      [studentsByClass['CM2-A']]
    );
    const [[e3Best]] = await conn.query(
      `SELECT g.student_id, AVG(g.value) as avg FROM grades g WHERE g.student_id IN (?) AND g.period='trimestre1' GROUP BY g.student_id ORDER BY avg DESC LIMIT 1`,
      [studentsByClass['3e-A']]
    );
    if (cm2Best) {
      await conn.query(
        `INSERT IGNORE INTO top_students (school_id, academic_year_id, period, level, cycle, class_id, student_id, average, mention, created_by)
         VALUES (?,?,?,?,?,?,?,?,?,?)`,
        [schoolId, ayId, 'trimestre1', 'CM2', 'primaire', classIds['CM2-A'], cm2Best.student_id, cm2Best.avg, 'Très bien', directorId]
      );
    }
    if (e3Best) {
      await conn.query(
        `INSERT IGNORE INTO top_students (school_id, academic_year_id, period, level, cycle, class_id, student_id, average, mention, created_by)
         VALUES (?,?,?,?,?,?,?,?,?,?)`,
        [schoolId, ayId, 'trimestre1', '3ème', 'secondaire', classIds['3e-A'], e3Best.student_id, e3Best.avg, 'Bien', directorId]
      );
    }
    console.log("✅ Tableau d'honneur créé (major CM2 + major 3ème)");

    // ─── Notifications ──────────────────────────────────────────────────────
    await conn.query(
      `INSERT INTO notifications (user_id, school_id, title, content, type) VALUES (?,?,?,?,'absence'),(?,?,?,?,'finance')`,
      [parent1, schoolId, 'Absence signalée', 'Votre enfant était absent aujourd\'hui.',
       parent4, schoolId, 'Facture en retard', "La facture OLI-2026-0006 est en retard de paiement."]
    );
    console.log('✅ Notifications créées');

    console.log('\n\x1b[32m🎉 Seed OliTech terminé avec succès !\x1b[0m');
    console.log(`\n📋 Mot de passe unique pour tous les comptes créés : ${PASSWORD}`);
    console.log('\nComptes clés à tester :');
    console.log('  Directeur     : olitech@gmail.com (mot de passe existant, inchangé)');
    console.log('  Enseignant(e) : awa.cisse@olitech.ci');
    console.log('  Comptable     : chantal.boni@olitech.ci');
    console.log('  Secrétariat   : aminata.sy@olitech.ci');
    console.log('  Bibliothécaire: serge.kouame@olitech.ci');
    console.log('  Infirmière    : ruth.anoh@olitech.ci');
    console.log("  CPE           : bakary.sidibe@olitech.ci");
    console.log('  Maintenance   : moussa.fofana@olitech.ci');
    console.log('  Parent        : georges.kouassi@gmail.com (4 familles au total)');
    console.log('  Portail élève : aaron.kouassi@olitech-eleve.ci');
  } catch (err) {
    console.error('\x1b[31m❌ Erreur:', err.message, '\x1b[0m');
    console.error(err);
    process.exit(1);
  } finally {
    if (conn) await conn.end();
  }
}

seed();
