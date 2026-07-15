-- Migration v9 : RBAC réel — permissions manquantes pour les modules non couverts
-- par le référentiel roles/permissions/role_permissions (v2), + réconciliation
-- des écarts entre les rôles codés en dur historiques et les permissions seedées.
-- À exécuter UNE SEULE FOIS : mysql -u root -p ecolio < migration_v9.sql

INSERT IGNORE INTO permissions (code, label, module) VALUES
  ('payroll.read',          'Consulter la paye',                    'payroll'),
  ('payroll.write',         'Générer et modifier les bulletins',    'payroll'),
  ('payroll.pay',           'Marquer un bulletin comme payé',       'payroll'),
  ('exams.write',           'Planifier et gérer les examens',       'exams'),
  ('staff_attendance.read', 'Consulter les pointages du personnel', 'staff_attendance'),
  ('staff_attendance.write','Saisir les pointages du personnel',    'staff_attendance'),
  ('academic_years.write',  'Gérer les années scolaires',           'academic_years'),
  ('sms.send',              'Envoyer et consulter les SMS',         'sms');

INSERT IGNORE INTO role_permissions (role_code, permission_code) VALUES
  ('super_admin','payroll.read'),('super_admin','payroll.write'),('super_admin','payroll.pay'),
  ('director','payroll.read'),('director','payroll.write'),('director','payroll.pay'),
  ('accountant','payroll.read'),('accountant','payroll.write'),('accountant','payroll.pay'),

  ('super_admin','exams.write'),('director','exams.write'),('teacher','exams.write'),

  ('super_admin','staff_attendance.read'),('super_admin','staff_attendance.write'),
  ('director','staff_attendance.read'),('director','staff_attendance.write'),
  ('secretary','staff_attendance.read'),('secretary','staff_attendance.write'),

  ('super_admin','academic_years.write'),('director','academic_years.write'),

  ('super_admin','sms.send'),('director','sms.send'),('secretary','sms.send'),

  -- Réconciliation : préserve l'accès effectif déjà en place avant le passage au RBAC réel
  ('accountant','staff.read'),
  ('secretary','grades.read');

-- 'grades.read' sert désormais à protéger la route staff GET /grades (liste/consultation
-- par le personnel). Le portail parent/élève vérifie l'appartenance directement en code
-- (authorize('parent'|'student') + contrôle d'ownership) sans passer par ce système de
-- permissions : ces deux lignes du seed initial (v2) ne correspondaient à aucun accès réel
-- et auraient permis à un parent/élève de passer la vérification de la route staff.
DELETE FROM role_permissions WHERE role_code IN ('parent','student') AND permission_code = 'grades.read';
