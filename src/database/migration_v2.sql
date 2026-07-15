-- ============================================================
-- Écolio — Migration v2 (tables manquantes + nouveaux rôles)
-- Exécuter : mysql -u root -p ecolio < migration_v2.sql
-- ============================================================

-- 1. Étendre l'ENUM des rôles utilisateurs
ALTER TABLE users MODIFY COLUMN role
  ENUM('super_admin','director','teacher','parent','student','accountant',
       'counselor','librarian','nurse','maintenance')
  NOT NULL DEFAULT 'teacher';

-- 2. Paiements (historique des transactions)
CREATE TABLE IF NOT EXISTS payments (
  id           INT PRIMARY KEY AUTO_INCREMENT,
  school_id    INT NOT NULL,
  invoice_id   INT NOT NULL,
  amount       DECIMAL(12,2) NOT NULL,
  method       ENUM('orange_money','mtn_money','wave','moov_money','especes','cheque','virement') NOT NULL DEFAULT 'especes',
  reference    VARCHAR(100),
  notes        TEXT,
  paid_by      INT,
  recorded_by  INT,
  paid_at      TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (school_id)   REFERENCES schools(id)  ON DELETE CASCADE,
  FOREIGN KEY (invoice_id)  REFERENCES invoices(id) ON DELETE CASCADE,
  FOREIGN KEY (paid_by)     REFERENCES users(id)    ON DELETE SET NULL,
  FOREIGN KEY (recorded_by) REFERENCES users(id)    ON DELETE SET NULL
);

-- 3. Bulletins (snapshots générés)
CREATE TABLE IF NOT EXISTS bulletins (
  id               INT PRIMARY KEY AUTO_INCREMENT,
  school_id        INT NOT NULL,
  student_id       INT NOT NULL,
  academic_year_id INT,
  period           ENUM('trimestre1','trimestre2','trimestre3','semestre1','semestre2') NOT NULL,
  general_average  DECIMAL(5,2),
  class_rank       INT,
  class_total      INT,
  appreciation     TEXT,
  generated_by     INT,
  generated_at     TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (school_id)   REFERENCES schools(id)   ON DELETE CASCADE,
  FOREIGN KEY (student_id)  REFERENCES students(id)  ON DELETE CASCADE,
  FOREIGN KEY (generated_by) REFERENCES users(id)    ON DELETE SET NULL
);

-- 4. Rôles (référentiel)
CREATE TABLE IF NOT EXISTS roles (
  id          INT PRIMARY KEY AUTO_INCREMENT,
  code        VARCHAR(50) UNIQUE NOT NULL,
  label       VARCHAR(100) NOT NULL,
  description TEXT,
  color       VARCHAR(7) DEFAULT '#1A3C5E',
  is_staff    TINYINT(1) DEFAULT 1,
  created_at  TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- 5. Permissions
CREATE TABLE IF NOT EXISTS permissions (
  id         INT PRIMARY KEY AUTO_INCREMENT,
  code       VARCHAR(100) UNIQUE NOT NULL,
  label      VARCHAR(100) NOT NULL,
  module     VARCHAR(50) NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- 6. Liaison rôle ↔ permission
CREATE TABLE IF NOT EXISTS role_permissions (
  role_code       VARCHAR(50) NOT NULL,
  permission_code VARCHAR(100) NOT NULL,
  PRIMARY KEY (role_code, permission_code)
);

-- ── Données initiales des rôles ─────────────────────────────────────────────
INSERT IGNORE INTO roles (code, label, description, color, is_staff) VALUES
  ('super_admin', 'Super Administrateur',      'Accès total à toutes les fonctionnalités', '#7c3aed', 1),
  ('director',    'Directeur',                 'Gestion complète de l''école',             '#1A3C5E', 1),
  ('teacher',     'Enseignant(e)',              'Gestion des notes et des présences',       '#2E86AB', 1),
  ('parent',      'Parent / Tuteur',            'Suivi des enfants inscrits',               '#2ecc71', 0),
  ('student',     'Élève',                     'Accès aux notes et à l''emploi du temps',  '#f59e0b', 0),
  ('accountant',  'Comptable',                 'Gestion financière et facturation',         '#d97706', 1),
  ('counselor',   'Conseiller d''éducation',   'Suivi des présences et discipline',         '#6366f1', 1),
  ('librarian',   'Bibliothécaire',             'Gestion de la bibliothèque',               '#ec4899', 1),
  ('nurse',       'Infirmier(e)',               'Suivi médical des élèves',                 '#ef4444', 1),
  ('maintenance', 'Agent de maintenance',       'Entretien, logistique et sécurité',        '#78716c', 1);

-- ── Permissions de base ─────────────────────────────────────────────────────
INSERT IGNORE INTO permissions (code, label, module) VALUES
  ('students.read',    'Voir la liste des élèves',       'students'),
  ('students.write',   'Créer et modifier les élèves',   'students'),
  ('students.delete',  'Archiver les élèves',            'students'),
  ('grades.read',      'Consulter les notes',             'grades'),
  ('grades.write',     'Saisir et modifier les notes',   'grades'),
  ('attendance.read',  'Consulter les présences',         'attendance'),
  ('attendance.write', 'Saisir les présences',            'attendance'),
  ('finance.read',     'Consulter les finances',          'finance'),
  ('finance.write',    'Créer et modifier les factures',  'finance'),
  ('finance.pay',      'Enregistrer les paiements',       'finance'),
  ('staff.read',       'Voir la liste du personnel',      'staff'),
  ('staff.write',      'Gérer le personnel',              'staff'),
  ('classes.read',     'Voir les classes',                'classes'),
  ('classes.write',    'Gérer les classes',               'classes'),
  ('subjects.write',   'Gérer les matières',              'subjects'),
  ('schedule.write',   'Gérer l''emploi du temps',        'schedule'),
  ('messages.read',    'Lire les messages',               'messages'),
  ('messages.write',   'Envoyer des messages',            'messages'),
  ('reports.read',     'Consulter les rapports',          'reports'),
  ('settings.write',   'Modifier les paramètres école',   'settings'),
  ('cards.generate',   'Générer cartes et bulletins',     'cards');

-- ── Affectation des permissions par rôle ────────────────────────────────────
INSERT IGNORE INTO role_permissions (role_code, permission_code) VALUES
  -- Super admin & Directeur : tout
  ('super_admin','students.read'),('super_admin','students.write'),('super_admin','students.delete'),
  ('super_admin','grades.read'),('super_admin','grades.write'),
  ('super_admin','attendance.read'),('super_admin','attendance.write'),
  ('super_admin','finance.read'),('super_admin','finance.write'),('super_admin','finance.pay'),
  ('super_admin','staff.read'),('super_admin','staff.write'),
  ('super_admin','classes.read'),('super_admin','classes.write'),
  ('super_admin','subjects.write'),('super_admin','schedule.write'),
  ('super_admin','messages.read'),('super_admin','messages.write'),
  ('super_admin','reports.read'),('super_admin','settings.write'),('super_admin','cards.generate'),
  ('director','students.read'),('director','students.write'),('director','students.delete'),
  ('director','grades.read'),('director','grades.write'),
  ('director','attendance.read'),('director','attendance.write'),
  ('director','finance.read'),('director','finance.write'),('director','finance.pay'),
  ('director','staff.read'),('director','staff.write'),
  ('director','classes.read'),('director','classes.write'),
  ('director','subjects.write'),('director','schedule.write'),
  ('director','messages.read'),('director','messages.write'),
  ('director','reports.read'),('director','settings.write'),('director','cards.generate'),
  -- Enseignant
  ('teacher','students.read'),('teacher','grades.read'),('teacher','grades.write'),
  ('teacher','attendance.read'),('teacher','attendance.write'),
  ('teacher','classes.read'),('teacher','messages.read'),('teacher','messages.write'),
  ('teacher','cards.generate'),
  -- Comptable
  ('accountant','students.read'),('accountant','finance.read'),('accountant','finance.write'),
  ('accountant','finance.pay'),('accountant','messages.read'),('accountant','messages.write'),
  ('accountant','reports.read'),
  -- Conseiller d'éducation
  ('counselor','students.read'),('counselor','attendance.read'),('counselor','attendance.write'),
  ('counselor','classes.read'),('counselor','messages.read'),('counselor','messages.write'),
  -- Parent
  ('parent','grades.read'),('parent','attendance.read'),('parent','messages.read'),('parent','messages.write'),
  -- Élève
  ('student','grades.read'),('student','attendance.read'),('student','messages.read'),
  -- Bibliothécaire
  ('librarian','students.read'),('librarian','messages.read'),('librarian','messages.write'),
  -- Infirmier
  ('nurse','students.read'),('nurse','messages.read'),('nurse','messages.write'),
  -- Maintenance
  ('maintenance','messages.read'),('maintenance','messages.write');

-- ── Indexes ─────────────────────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_payments_invoice   ON payments(invoice_id);
CREATE INDEX IF NOT EXISTS idx_payments_school    ON payments(school_id, paid_at);
CREATE INDEX IF NOT EXISTS idx_bulletins_student  ON bulletins(student_id, period);
CREATE INDEX IF NOT EXISTS idx_bulletins_school   ON bulletins(school_id, academic_year_id);
