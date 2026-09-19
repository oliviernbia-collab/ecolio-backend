-- Migration v17 : publications publiques d'école (images, vidéos, annonces) — affichées
-- sur la fiche publique de l'école (/ecoles/:id), accessible depuis "Elles utilisent Écolio"
-- sur la page d'accueil. À exécuter UNE SEULE FOIS : mysql -u root -p ecolio < migration_v17.sql

CREATE TABLE IF NOT EXISTS school_publications (
  id INT AUTO_INCREMENT PRIMARY KEY,
  school_id INT NOT NULL,
  type ENUM('image','video','announcement','other') NOT NULL DEFAULT 'announcement',
  title VARCHAR(255) NULL,
  content TEXT NULL,
  media_url VARCHAR(500) NULL,
  media_type VARCHAR(20) NULL,
  created_by INT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  FOREIGN KEY (school_id) REFERENCES schools(id) ON DELETE CASCADE,
  FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE SET NULL,
  INDEX idx_school_publications_school (school_id, created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

INSERT IGNORE INTO permissions (code, label, module) VALUES
  ('publications.manage', 'Publier des actualités publiques de l\'école (images, vidéos, annonces)', 'publications');

INSERT IGNORE INTO role_permissions (role_code, permission_code) VALUES
  ('super_admin','publications.manage'),
  ('director','publications.manage');
