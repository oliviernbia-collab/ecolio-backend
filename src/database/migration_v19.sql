-- Migration v19 : révocation des sessions.
-- token_version : incrémenté à chaque changement / réinitialisation de mot de passe, ce qui
--   invalide immédiatement toutes les sessions ouvertes de l'utilisateur (le JWT porte la version).
-- revoked_tokens : sessions fermées par « Déconnexion » (identifiant jti du JWT), conservées
--   jusqu'à leur date d'expiration naturelle.
-- Appliquée automatiquement au démarrage (services/schema.js), ce fichier sert de référence :
-- mysql -u root -p ecolio < migration_v19.sql

ALTER TABLE users ADD COLUMN token_version INT NOT NULL DEFAULT 0;

CREATE TABLE IF NOT EXISTS revoked_tokens (
  jti CHAR(32) PRIMARY KEY,
  expires_at DATETIME NOT NULL,
  INDEX idx_revoked_tokens_expires (expires_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
