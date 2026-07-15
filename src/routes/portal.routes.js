const router = require('express').Router();
const { authenticate, authorize } = require('../middleware/auth');
const ctrl = require('../controllers/portal.controller');

// ── Portail Parent ──────────────────────────────────────────────────────────
router.get('/parent/children',                   authenticate, authorize('parent'), ctrl.getChildren);
router.get('/parent/children/:studentId/grades', authenticate, authorize('parent'), ctrl.getChildGrades);
router.get('/parent/children/:studentId/attendance', authenticate, authorize('parent'), ctrl.getChildAttendance);
router.get('/parent/children/:studentId/schedule',   authenticate, authorize('parent'), ctrl.getChildSchedule);
router.get('/parent/children/:studentId/invoices',   authenticate, authorize('parent'), ctrl.getChildInvoices);

// ── Portail Élève ───────────────────────────────────────────────────────────
router.get('/student/me',         authenticate, authorize('student'), ctrl.getStudentMe);
router.get('/student/grades',     authenticate, authorize('student'), ctrl.getStudentGrades);
router.get('/student/attendance', authenticate, authorize('student'), ctrl.getStudentAttendance);
router.get('/student/schedule',   authenticate, authorize('student'), ctrl.getStudentSchedule);

module.exports = router;
