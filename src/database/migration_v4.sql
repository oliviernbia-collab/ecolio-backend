-- Migration v4 : lien user ↔ élève pour le portail élève
-- À exécuter UNE SEULE FOIS : mysql -u root -p ecolio < migration_v4.sql

ALTER TABLE users
  ADD COLUMN student_id INT NULL DEFAULT NULL AFTER school_id;

ALTER TABLE users
  ADD CONSTRAINT fk_users_student
  FOREIGN KEY (student_id) REFERENCES students(id) ON DELETE SET NULL;
