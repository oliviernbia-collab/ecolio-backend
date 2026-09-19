-- Migration v14 : journal d'activité (audit log) — plateforme + par école
-- À exécuter UNE SEULE FOIS : mysql -u root -p ecolio < migration_v14.sql

CREATE TABLE IF NOT EXISTS activity_logs (
  id INT AUTO_INCREMENT PRIMARY KEY,
  school_id INT NULL,
  user_id INT NULL,
  user_name VARCHAR(150) NULL,
  user_role VARCHAR(30) NULL,
  action VARCHAR(30) NOT NULL,
  entity_type VARCHAR(50) NOT NULL,
  entity_id INT NULL,
  description TEXT NULL,
  ip_address VARCHAR(45) NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (school_id) REFERENCES schools(id) ON DELETE SET NULL,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE SET NULL,
  INDEX idx_activity_school_created (school_id, created_at),
  INDEX idx_activity_created (created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

INSERT IGNORE INTO permissions (code, label, module) VALUES
  ('activity_logs.view', "Consulter le journal d'activité", 'activity_logs');

INSERT IGNORE INTO role_permissions (role_code, permission_code) VALUES
  ('super_admin','activity_logs.view'),
  ('director','activity_logs.view');
