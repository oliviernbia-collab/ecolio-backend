// Conditions SQL partagées pour cibler des groupes de destinataires (messagerie interne + SMS)
const GROUP_CONDITIONS = {
  all_teachers: "role = 'teacher'",
  all_parents:  "role = 'parent'",
  all_students: "role = 'student'",
  all_staff:    "role IN ('teacher','accountant','counselor','librarian','nurse','maintenance','secretary')",
  all_school:   "role IN ('teacher','parent','student','accountant','counselor','librarian','nurse','maintenance','secretary')",
};

const GROUP_LABELS = {
  all_teachers: 'Tous les enseignants',
  all_parents:  'Tous les parents',
  all_students: 'Tous les élèves',
  all_staff:    'Tout le personnel',
  all_school:   "Toute l'école",
};

module.exports = { GROUP_CONDITIONS, GROUP_LABELS };
