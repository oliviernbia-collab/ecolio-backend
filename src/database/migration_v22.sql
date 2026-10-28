-- Migration v22 : numéro de téléphone (optionnel) de l'élève, pour les élèves du secondaire
-- qui reçoivent eux-mêmes les SMS de l'école (maternelle et primaire : SMS au parent).
-- Appliquée automatiquement au démarrage (services/schema.js), ce fichier sert de référence :
-- mysql -u root -p ecolio < migration_v22.sql

ALTER TABLE students ADD COLUMN phone VARCHAR(30) NULL AFTER gender;
