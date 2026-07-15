-- Migration v6 : Examens, Pointages du personnel, Paye, Services SMS
-- À exécuter UNE SEULE FOIS : mysql -u root -p ecolio < migration_v6.sql

-- 1. Examens (planification distincte des évaluations courantes)
CREATE TABLE IF NOT EXISTS exams (
  id               INT PRIMARY KEY AUTO_INCREMENT,
  school_id        INT NOT NULL,
  academic_year_id INT,
  class_id         INT NOT NULL,
  subject_id       INT NOT NULL,
  title            VARCHAR(150) NOT NULL,
  exam_date        DATE NOT NULL,
  start_time       TIME NOT NULL,
  end_time         TIME NOT NULL,
  room_id          INT,
  period           ENUM('trimestre1','trimestre2','trimestre3','semestre1','semestre2') NOT NULL DEFAULT 'trimestre1',
  max_value        DECIMAL(5,2) DEFAULT 20,
  status           ENUM('planifie','termine','annule') NOT NULL DEFAULT 'planifie',
  created_by       INT,
  created_at       TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (school_id)  REFERENCES schools(id)  ON DELETE CASCADE,
  FOREIGN KEY (class_id)   REFERENCES classes(id)  ON DELETE CASCADE,
  FOREIGN KEY (subject_id) REFERENCES subjects(id) ON DELETE CASCADE,
  FOREIGN KEY (room_id)    REFERENCES rooms(id)    ON DELETE SET NULL
);

CREATE TABLE IF NOT EXISTS exam_supervisors (
  exam_id    INT NOT NULL,
  teacher_id INT NOT NULL,
  PRIMARY KEY (exam_id, teacher_id),
  FOREIGN KEY (exam_id)    REFERENCES exams(id) ON DELETE CASCADE,
  FOREIGN KEY (teacher_id) REFERENCES users(id) ON DELETE CASCADE
);

-- Relie une note à sa planification d'examen, sans changer la logique de bulletin existante
ALTER TABLE grades ADD COLUMN exam_id INT NULL DEFAULT NULL AFTER subject_id;
ALTER TABLE grades ADD CONSTRAINT fk_grades_exam FOREIGN KEY (exam_id) REFERENCES exams(id) ON DELETE SET NULL;

-- 2. Pointages du personnel (manuel, prêt pour import biométrique futur)
CREATE TABLE IF NOT EXISTS staff_attendance (
  id              INT PRIMARY KEY AUTO_INCREMENT,
  school_id       INT NOT NULL,
  staff_id        INT NOT NULL,
  date            DATE NOT NULL,
  check_in_time   TIME NULL,
  check_out_time  TIME NULL,
  status          ENUM('present','absent','retard','conge') NOT NULL DEFAULT 'present',
  source          ENUM('manuel','biometrique') NOT NULL DEFAULT 'manuel',
  device_id       VARCHAR(100) NULL,
  notes           TEXT,
  recorded_by     INT,
  created_at      TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY unique_staff_attendance (staff_id, date),
  FOREIGN KEY (school_id)   REFERENCES schools(id) ON DELETE CASCADE,
  FOREIGN KEY (staff_id)    REFERENCES staff(id)   ON DELETE CASCADE,
  FOREIGN KEY (recorded_by) REFERENCES users(id)   ON DELETE SET NULL
);

-- 3. Paye
CREATE TABLE IF NOT EXISTS payslips (
  id                INT PRIMARY KEY AUTO_INCREMENT,
  school_id         INT NOT NULL,
  staff_id          INT NOT NULL,
  period_month      CHAR(7) NOT NULL COMMENT 'Format YYYY-MM',
  reference         VARCHAR(50) UNIQUE,
  base_salary       DECIMAL(12,2) NOT NULL DEFAULT 0,
  bonuses           DECIMAL(12,2) NOT NULL DEFAULT 0,
  bonuses_detail    TEXT,
  deductions        DECIMAL(12,2) NOT NULL DEFAULT 0,
  deductions_detail TEXT,
  net_amount        DECIMAL(12,2) NOT NULL DEFAULT 0,
  status            ENUM('draft','paid') NOT NULL DEFAULT 'draft',
  payment_method    VARCHAR(50) NULL,
  paid_at           TIMESTAMP NULL,
  generated_by      INT,
  created_at        TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY unique_staff_period (staff_id, period_month),
  FOREIGN KEY (school_id) REFERENCES schools(id) ON DELETE CASCADE,
  FOREIGN KEY (staff_id)  REFERENCES staff(id)   ON DELETE CASCADE
);

-- 4. Services SMS
CREATE TABLE IF NOT EXISTS sms_logs (
  id               INT PRIMARY KEY AUTO_INCREMENT,
  school_id        INT NOT NULL,
  sender_id        INT,
  recipient_group  VARCHAR(50) NULL,
  trigger_type     ENUM('manuel','absence','facture') NOT NULL DEFAULT 'manuel',
  content          TEXT NOT NULL,
  recipient_count  INT NOT NULL DEFAULT 0,
  sent_count       INT NOT NULL DEFAULT 0,
  failed_count     INT NOT NULL DEFAULT 0,
  status           ENUM('pending','sent','partial','failed') NOT NULL DEFAULT 'pending',
  provider         VARCHAR(50) NOT NULL DEFAULT 'mock',
  created_at       TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (school_id) REFERENCES schools(id) ON DELETE CASCADE,
  FOREIGN KEY (sender_id) REFERENCES users(id)   ON DELETE SET NULL
);

CREATE TABLE IF NOT EXISTS sms_recipients (
  id          INT PRIMARY KEY AUTO_INCREMENT,
  sms_log_id  INT NOT NULL,
  user_id     INT NULL,
  phone       VARCHAR(50) NOT NULL,
  status      ENUM('sent','failed') NOT NULL DEFAULT 'sent',
  error       TEXT,
  FOREIGN KEY (sms_log_id) REFERENCES sms_logs(id) ON DELETE CASCADE,
  FOREIGN KEY (user_id)    REFERENCES users(id)    ON DELETE SET NULL
);

-- ── Indexes ─────────────────────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_exams_class       ON exams(class_id, exam_date);
CREATE INDEX IF NOT EXISTS idx_exams_school       ON exams(school_id, exam_date);
CREATE INDEX IF NOT EXISTS idx_staff_attendance_date ON staff_attendance(school_id, date);
CREATE INDEX IF NOT EXISTS idx_payslips_period    ON payslips(school_id, period_month);
CREATE INDEX IF NOT EXISTS idx_sms_logs_school    ON sms_logs(school_id, created_at);
