-- Migration v15 : essai gratuit de 30 jours + abonnement payant (5000 FCFA / mois via Wave)
-- À exécuter UNE SEULE FOIS : mysql -u root -p ecolio < migration_v15.sql

ALTER TABLE schools
  ADD COLUMN trial_ends_at DATETIME NULL AFTER is_active,
  ADD COLUMN subscription_paid_until DATETIME NULL AFTER trial_ends_at;

-- Écoles déjà existantes avant cette migration : on leur offre 30 jours à partir de
-- maintenant plutôt que de recalculer rétroactivement depuis leur date de création,
-- pour ne pas bloquer immédiatement des écoles déjà en cours d'utilisation.
UPDATE schools SET trial_ends_at = DATE_ADD(NOW(), INTERVAL 30 DAY) WHERE trial_ends_at IS NULL;

CREATE TABLE IF NOT EXISTS subscription_payments (
  id INT AUTO_INCREMENT PRIMARY KEY,
  school_id INT NOT NULL,
  amount DECIMAL(10,2) NOT NULL DEFAULT 5000,
  method VARCHAR(30) NOT NULL DEFAULT 'wave',
  wave_number VARCHAR(30) NOT NULL DEFAULT '0554183378',
  proof_url VARCHAR(255) NOT NULL,
  reference VARCHAR(100) NULL,
  status ENUM('pending','approved','rejected') NOT NULL DEFAULT 'pending',
  submitted_by INT NULL,
  submitted_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  reviewed_by INT NULL,
  reviewed_at DATETIME NULL,
  review_note TEXT NULL,
  FOREIGN KEY (school_id) REFERENCES schools(id) ON DELETE CASCADE,
  FOREIGN KEY (submitted_by) REFERENCES users(id) ON DELETE SET NULL,
  FOREIGN KEY (reviewed_by) REFERENCES users(id) ON DELETE SET NULL,
  INDEX idx_sub_payments_school (school_id, status)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

INSERT IGNORE INTO permissions (code, label, module) VALUES
  ('subscription.manage', "Gérer l'abonnement et les paiements de l'école", 'subscription');

INSERT IGNORE INTO role_permissions (role_code, permission_code) VALUES
  ('super_admin','subscription.manage'),
  ('director','subscription.manage');
