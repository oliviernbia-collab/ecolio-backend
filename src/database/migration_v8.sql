-- Migration v8 : changement de mot de passe forcé au premier login
-- À exécuter UNE SEULE FOIS : mysql -u root -p ecolio < migration_v8.sql

ALTER TABLE users ADD COLUMN must_change_password TINYINT(1) NOT NULL DEFAULT 0 AFTER password;
