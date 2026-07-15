-- Migration v5 : ajout du rôle Secrétariat
-- À exécuter UNE SEULE FOIS : mysql -u root -p ecolio < migration_v5.sql

-- 1. Étendre l'ENUM des rôles utilisateurs
ALTER TABLE users MODIFY COLUMN role
  ENUM('super_admin','director','teacher','parent','student','accountant',
       'counselor','librarian','nurse','maintenance','secretary')
  NOT NULL DEFAULT 'teacher';

-- 2. Référentiel des rôles (si la table existe — voir migration_v2.sql)
INSERT IGNORE INTO roles (code, label, description, color, is_staff) VALUES
  ('secretary', 'Secrétariat', 'Inscriptions, dossiers élèves et communication', '#0ea5e9', 1);

-- 3. Permissions du secrétariat (si les tables existent — voir migration_v2.sql)
INSERT IGNORE INTO role_permissions (role_code, permission_code) VALUES
  ('secretary','students.read'),('secretary','students.write'),
  ('secretary','staff.read'),
  ('secretary','classes.read'),
  ('secretary','messages.read'),('secretary','messages.write'),
  ('secretary','reports.read'),('secretary','cards.generate');
