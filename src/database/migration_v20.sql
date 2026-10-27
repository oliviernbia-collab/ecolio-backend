-- Migration v20 : double authentification (2FA) par application TOTP (Google Authenticator,
-- Microsoft Authenticator, Authy...).
-- totp_secret : secret chiffré (AES-256-GCM), posé dès la configuration, actif seulement quand totp_enabled = 1
-- totp_last_step : dernier pas de temps accepté, pour qu'un même code ne serve pas deux fois
-- user_recovery_codes : codes de secours à usage unique (hachés), en cas de téléphone perdu
-- Appliquée automatiquement au démarrage (services/schema.js), ce fichier sert de référence :
-- mysql -u root -p ecolio < migration_v20.sql

ALTER TABLE users ADD COLUMN totp_secret VARCHAR(255) NULL;
ALTER TABLE users ADD COLUMN totp_enabled TINYINT(1) NOT NULL DEFAULT 0;
ALTER TABLE users ADD COLUMN totp_last_step BIGINT NULL;

CREATE TABLE IF NOT EXISTS user_recovery_codes (
  id INT AUTO_INCREMENT PRIMARY KEY,
  user_id INT NOT NULL,
  code_hash CHAR(64) NOT NULL,
  used_at DATETIME NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  INDEX idx_recovery_codes_user (user_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
