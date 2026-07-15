-- Migration v12 : module Cantine / Transport (services périscolaires + abonnements)
-- À exécuter UNE SEULE FOIS : mysql -u root -p ecolio < migration_v12.sql

CREATE TABLE IF NOT EXISTS services (
  id          INT PRIMARY KEY AUTO_INCREMENT,
  school_id   INT NOT NULL,
  type        ENUM('cantine','transport') NOT NULL,
  name        VARCHAR(150) NOT NULL,
  description TEXT,
  price       DECIMAL(12,2) NOT NULL DEFAULT 0,
  is_active   TINYINT(1) NOT NULL DEFAULT 1,
  created_at  TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (school_id) REFERENCES schools(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS service_subscriptions (
  id          INT PRIMARY KEY AUTO_INCREMENT,
  school_id   INT NOT NULL,
  service_id  INT NOT NULL,
  student_id  INT NOT NULL,
  start_date  DATE NOT NULL,
  end_date    DATE NULL,
  status      ENUM('active','suspendu','termine') NOT NULL DEFAULT 'active',
  notes       VARCHAR(255),
  created_by  INT,
  created_at  TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (school_id)   REFERENCES schools(id)   ON DELETE CASCADE,
  FOREIGN KEY (service_id)  REFERENCES services(id)  ON DELETE CASCADE,
  FOREIGN KEY (student_id)  REFERENCES students(id)  ON DELETE CASCADE,
  FOREIGN KEY (created_by)  REFERENCES users(id)     ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS idx_services_school       ON services(school_id, type);
CREATE INDEX IF NOT EXISTS idx_subscriptions_school   ON service_subscriptions(school_id, status);
CREATE INDEX IF NOT EXISTS idx_subscriptions_student  ON service_subscriptions(student_id);

INSERT IGNORE INTO permissions (code, label, module) VALUES
  ('services.read',  'Consulter cantine/transport',           'services'),
  ('services.write', 'Gérer les services et abonnements',     'services');

INSERT IGNORE INTO role_permissions (role_code, permission_code) VALUES
  ('super_admin','services.read'),('super_admin','services.write'),
  ('director','services.read'),('director','services.write'),
  ('secretary','services.read'),('secretary','services.write'),
  ('accountant','services.read');
