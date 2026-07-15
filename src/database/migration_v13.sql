-- Migration v13 : panneau plateforme super-admin (statut actif/suspendu par école)
-- À exécuter UNE SEULE FOIS : mysql -u root -p ecolio < migration_v13.sql

ALTER TABLE schools ADD COLUMN is_active TINYINT(1) NOT NULL DEFAULT 1 AFTER is_public;
