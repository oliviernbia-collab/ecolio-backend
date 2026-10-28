-- Migration v21 : permissions individuelles du personnel, gérées par le directeur de chaque école.
-- Une ligne = un écart par rapport aux permissions par défaut du rôle (role_permissions) :
-- granted = 1 : permission accordée en plus du rôle, granted = 0 : permission retirée.
-- Sans ligne, le membre du personnel a exactement les permissions de son rôle.
-- Appliquée automatiquement au démarrage (services/schema.js), ce fichier sert de référence :
-- mysql -u root -p ecolio < migration_v21.sql

CREATE TABLE IF NOT EXISTS user_permissions (
  user_id INT NOT NULL,
  permission_code VARCHAR(100) NOT NULL,
  granted TINYINT(1) NOT NULL,
  updated_by INT NULL,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (user_id, permission_code),
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  FOREIGN KEY (updated_by) REFERENCES users(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
