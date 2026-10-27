-- Migration v18 : réglages de la plateforme (prix de l'abonnement, message défilant de la
-- page d'accueil), cadeaux d'abonnement offerts par le super admin et messages de contact.
-- Ces tables sont aussi créées automatiquement au démarrage du backend (services/schema.js),
-- ce fichier sert de référence ou pour une installation manuelle :
-- mysql -u root -p ecolio < migration_v18.sql

CREATE TABLE IF NOT EXISTS platform_settings (
  setting_key VARCHAR(64) PRIMARY KEY,
  setting_value TEXT NULL,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS subscription_gifts (
  id INT AUTO_INCREMENT PRIMARY KEY,
  school_id INT NOT NULL,
  days INT NOT NULL,
  message TEXT NULL,
  granted_by INT NULL,
  paid_until_after DATETIME NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (school_id) REFERENCES schools(id) ON DELETE CASCADE,
  FOREIGN KEY (granted_by) REFERENCES users(id) ON DELETE SET NULL,
  INDEX idx_subscription_gifts_school (school_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS contact_messages (
  id INT AUTO_INCREMENT PRIMARY KEY,
  reference VARCHAR(20) NOT NULL UNIQUE,
  user_id INT NULL,
  name VARCHAR(150) NOT NULL,
  email VARCHAR(190) NOT NULL,
  phone VARCHAR(50) NULL,
  subject VARCHAR(200) NULL,
  message TEXT NOT NULL,
  reply TEXT NULL,
  replied_by INT NULL,
  replied_at DATETIME NULL,
  status ENUM('new','read','replied') NOT NULL DEFAULT 'new',
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE SET NULL,
  FOREIGN KEY (replied_by) REFERENCES users(id) ON DELETE SET NULL,
  INDEX idx_contact_messages_email (email),
  INDEX idx_contact_messages_status (status, created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
