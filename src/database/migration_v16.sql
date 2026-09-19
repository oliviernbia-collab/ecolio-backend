-- Migration v16 : tableau d'honneur — meilleur(e) élève par niveau, par trimestre,
-- affiché publiquement sur le site (visible uniquement pour les écoles publiques).
-- À exécuter UNE SEULE FOIS : mysql -u root -p ecolio < migration_v16.sql

CREATE TABLE IF NOT EXISTS top_students (
  id INT AUTO_INCREMENT PRIMARY KEY,
  school_id INT NOT NULL,
  academic_year_id INT NOT NULL,
  period VARCHAR(20) NOT NULL,
  level VARCHAR(50) NOT NULL,
  cycle ENUM('maternelle','primaire','secondaire') NOT NULL DEFAULT 'primaire',
  class_id INT NULL,
  student_id INT NOT NULL,
  average DECIMAL(5,2) NULL,
  mention VARCHAR(100) NULL,
  created_by INT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  FOREIGN KEY (school_id) REFERENCES schools(id) ON DELETE CASCADE,
  FOREIGN KEY (academic_year_id) REFERENCES academic_years(id) ON DELETE CASCADE,
  FOREIGN KEY (class_id) REFERENCES classes(id) ON DELETE SET NULL,
  FOREIGN KEY (student_id) REFERENCES students(id) ON DELETE CASCADE,
  FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE SET NULL,
  UNIQUE KEY uniq_top_student_slot (school_id, academic_year_id, period, level),
  INDEX idx_top_students_school (school_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

INSERT IGNORE INTO permissions (code, label, module) VALUES
  ('top_students.manage', "Gérer le tableau d'honneur (meilleurs élèves)", 'top_students');

INSERT IGNORE INTO role_permissions (role_code, permission_code) VALUES
  ('super_admin','top_students.manage'),
  ('director','top_students.manage');
