-- Migration v11 : module Infirmerie / Santé
-- À exécuter UNE SEULE FOIS : mysql -u root -p ecolio < migration_v11.sql

CREATE TABLE IF NOT EXISTS health_visits (
  id           INT PRIMARY KEY AUTO_INCREMENT,
  school_id    INT NOT NULL,
  student_id   INT NOT NULL,
  visit_date   DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  reason       VARCHAR(255) NOT NULL,
  treatment    TEXT,
  temperature  DECIMAL(4,1) NULL,
  sent_home    TINYINT(1) NOT NULL DEFAULT 0,
  notes        TEXT,
  recorded_by  INT,
  created_at   TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (school_id)  REFERENCES schools(id)  ON DELETE CASCADE,
  FOREIGN KEY (student_id) REFERENCES students(id) ON DELETE CASCADE,
  FOREIGN KEY (recorded_by) REFERENCES users(id)   ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS idx_health_visits_school  ON health_visits(school_id, visit_date);
CREATE INDEX IF NOT EXISTS idx_health_visits_student ON health_visits(student_id);

INSERT IGNORE INTO permissions (code, label, module) VALUES
  ('health.read',  'Consulter les visites infirmerie', 'health'),
  ('health.write', 'Enregistrer une visite infirmerie', 'health');

INSERT IGNORE INTO role_permissions (role_code, permission_code) VALUES
  ('super_admin','health.read'),('super_admin','health.write'),
  ('director','health.read'),('director','health.write'),
  ('nurse','health.read'),('nurse','health.write');
