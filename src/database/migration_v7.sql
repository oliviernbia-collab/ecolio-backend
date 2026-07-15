-- Migration v7 : page d'accueil publique (ville + visibilité des écoles)
-- À exécuter UNE SEULE FOIS : mysql -u root -p ecolio < migration_v7.sql

ALTER TABLE schools ADD COLUMN city VARCHAR(100) NULL AFTER address;
ALTER TABLE schools ADD COLUMN is_public TINYINT(1) NOT NULL DEFAULT 0 AFTER logo_url;
