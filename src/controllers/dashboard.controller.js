const db = require('../config/database');
const { handleError } = require('../utils/errors');

// ── Helpers ───────────────────────────────────────────────────────────────────

async function directorStats(schoolId, userId) {
  const today = new Date().toISOString().split('T')[0];
  const [[students]]   = await db.execute("SELECT COUNT(*) as total FROM students WHERE school_id=? AND status!='archive'", [schoolId]);
  const [[teachers]]   = await db.execute("SELECT COUNT(*) as total FROM staff WHERE school_id=? AND is_active=1", [schoolId]);
  const [[classes]]    = await db.execute("SELECT COUNT(*) as total FROM classes WHERE school_id=?", [schoolId]);
  const [[todayAtt]]   = await db.execute(
    `SELECT COUNT(*) as total,
       COALESCE(SUM(CASE WHEN a.status='present' THEN 1 ELSE 0 END), 0) as present,
       COALESCE(SUM(CASE WHEN a.status='absent' THEN 1 ELSE 0 END), 0) as absent
     FROM attendance a JOIN students s ON a.student_id=s.id
     WHERE s.school_id=? AND a.date=?`, [schoolId, today]);
  const [[finance]]    = await db.execute(
    `SELECT COALESCE(SUM(amount),0) as total,
       COALESCE(SUM(CASE WHEN status='paid' THEN amount ELSE 0 END),0) as collected,
       COALESCE(SUM(CASE WHEN status IN('pending','overdue') THEN amount ELSE 0 END),0) as pending
     FROM invoices WHERE school_id=?`, [schoolId]);
  const [recentAbsences] = await db.execute(
    `SELECT a.date, a.status, a.justified, CONCAT(s.first_name,' ',s.last_name) as student_name, c.name as class_name
     FROM attendance a JOIN students s ON a.student_id=s.id JOIN classes c ON a.class_id=c.id
     WHERE s.school_id=? AND a.status='absent' ORDER BY a.date DESC LIMIT 6`, [schoolId]);
  const [classAverages] = await db.execute(
    `SELECT c.name as class_name, ROUND(AVG(g.value/g.max_value*20),2) as average
     FROM grades g JOIN students s ON g.student_id=s.id JOIN classes c ON s.class_id=c.id
     WHERE s.school_id=? GROUP BY c.id ORDER BY c.name`, [schoolId]);
  const [attendanceTrend] = await db.execute(
    `SELECT a.date, COUNT(*) as total,
       SUM(CASE WHEN a.status='present' THEN 1 ELSE 0 END) as present,
       SUM(CASE WHEN a.status='absent' THEN 1 ELSE 0 END) as absent
     FROM attendance a JOIN students s ON a.student_id=s.id
     WHERE s.school_id=? AND a.date >= DATE_SUB(CURDATE(), INTERVAL 7 DAY)
     GROUP BY a.date ORDER BY a.date`, [schoolId]);
  const [[unpaid]]     = await db.execute("SELECT COUNT(*) as count FROM invoices WHERE school_id=? AND status IN('pending','overdue')", [schoolId]);
  const [[unreadMsg]]  = await db.execute(
    `SELECT COUNT(*) as count FROM message_recipients mr JOIN messages m ON mr.message_id=m.id
     WHERE mr.recipient_id=? AND mr.read_at IS NULL`, [userId]);
  const [[staffAtt]]  = await db.execute(
    `SELECT COUNT(*) as pointed FROM staff_attendance WHERE school_id=? AND date=?`, [schoolId, today]);

  return {
    counters: { students: students.total, teachers: teachers.total, classes: classes.total,
                unpaid_invoices: unpaid.count, unread_messages: unreadMsg.count,
                staff_pointed_today: staffAtt.pointed, staff_total: teachers.total },
    attendance: { today: todayAtt, trend: attendanceTrend },
    finance: { total: finance.total || 0, collected: finance.collected || 0, pending: finance.pending || 0 },
    classAverages, recentAbsences,
  };
}

async function teacherStats(userId, schoolId) {
  const today = new Date().toISOString().split('T')[0];
  const dow = new Date().getDay(); // 0=dimanche, 1=lundi...
  const mysqlDow = dow === 0 ? 7 : dow; // convertir: lundi=1...samedi=6 en MySQL DAYOFWEEK-1

  const [myClasses]  = await db.execute(
    `SELECT c.*, COUNT(s.id) as student_count
     FROM classes c LEFT JOIN students s ON s.class_id=c.id AND s.status!='archive'
     WHERE c.teacher_id=? OR c.school_id=? AND c.id IN (
       SELECT DISTINCT class_id FROM schedule WHERE teacher_id=?
     )
     GROUP BY c.id ORDER BY c.name`, [userId, schoolId, userId]);

  const [todaySchedule] = await db.execute(
    `SELECT sch.*, sub.name as subject_name, c.name as class_name, r.name as room_name
     FROM schedule sch
     JOIN subjects sub ON sch.subject_id=sub.id
     JOIN classes c ON sch.class_id=c.id
     LEFT JOIN rooms r ON sch.room_id=r.id
     WHERE sch.teacher_id=? AND sch.day_of_week=?
     ORDER BY sch.start_time`, [userId, mysqlDow]);

  const [recentGrades] = await db.execute(
    `SELECT g.*, CONCAT(s.first_name,' ',s.last_name) as student_name, sub.name as subject_name
     FROM grades g
     JOIN students s ON g.student_id=s.id
     JOIN subjects sub ON g.subject_id=sub.id
     WHERE g.created_by=?
     ORDER BY g.created_at DESC LIMIT 8`, [userId]);

  const [[myStudents]] = await db.execute(
    `SELECT COUNT(DISTINCT s.id) as total FROM students s
     JOIN classes c ON s.class_id=c.id
     WHERE c.teacher_id=? AND s.status!='archive'`, [userId]);

  const [[todayAtt]] = await db.execute(
    `SELECT COUNT(*) as total,
       COALESCE(SUM(CASE WHEN a.status='present' THEN 1 ELSE 0 END),0) as present,
       COALESCE(SUM(CASE WHEN a.status='absent' THEN 1 ELSE 0 END),0) as absent
     FROM attendance a
     JOIN students s ON a.student_id=s.id
     JOIN classes c ON a.class_id=c.id
     WHERE c.teacher_id=? AND a.date=?`, [userId, today]);

  const [[unreadMsg]] = await db.execute(
    `SELECT COUNT(*) as count FROM message_recipients mr JOIN messages m ON mr.message_id=m.id
     WHERE mr.recipient_id=? AND mr.read_at IS NULL`, [userId]);

  return {
    counters: { my_classes: myClasses.length, my_students: myStudents.total,
                grades_given: recentGrades.length, unread_messages: unreadMsg.count },
    myClasses, todaySchedule, recentGrades,
    attendance: { today: todayAtt },
  };
}

async function parentStats(userId, schoolId) {
  const [myChildren] = await db.execute(
    `SELECT s.*, c.name as class_name, c.cycle
     FROM students s LEFT JOIN classes c ON s.class_id=c.id
     WHERE s.parent_id=? AND s.school_id=?
     ORDER BY s.first_name`, [userId, schoolId]);

  const childIds = myChildren.map(c => c.id);
  let recentGrades = [], recentAbsences = [], unpaidInvoices = [];

  if (childIds.length) {
    const placeholders = childIds.map(() => '?').join(',');
    [recentGrades] = await db.execute(
      `SELECT g.*, CONCAT(s.first_name,' ',s.last_name) as student_name,
              sub.name as subject_name
       FROM grades g
       JOIN students s ON g.student_id=s.id
       JOIN subjects sub ON g.subject_id=sub.id
       WHERE g.student_id IN (${placeholders})
       ORDER BY g.created_at DESC LIMIT 10`, childIds);

    [recentAbsences] = await db.execute(
      `SELECT a.date, a.status, a.justified,
              CONCAT(s.first_name,' ',s.last_name) as student_name, c.name as class_name
       FROM attendance a JOIN students s ON a.student_id=s.id
       LEFT JOIN classes c ON a.class_id=c.id
       WHERE a.student_id IN (${placeholders}) AND a.status='absent'
       ORDER BY a.date DESC LIMIT 8`, childIds);

    [unpaidInvoices] = await db.execute(
      `SELECT i.*, CONCAT(s.first_name,' ',s.last_name) as student_name
       FROM invoices i JOIN students s ON i.student_id=s.id
       WHERE i.student_id IN (${placeholders}) AND i.status IN('pending','overdue')
       ORDER BY i.due_date ASC LIMIT 5`, childIds);
  }

  const [[unreadMsg]] = await db.execute(
    `SELECT COUNT(*) as count FROM message_recipients mr JOIN messages m ON mr.message_id=m.id
     WHERE mr.recipient_id=? AND mr.read_at IS NULL`, [userId]);

  return {
    counters: { children: myChildren.length, unread_messages: unreadMsg.count,
                absences: recentAbsences.length, unpaid: unpaidInvoices.length },
    myChildren, recentGrades, recentAbsences, unpaidInvoices,
  };
}

async function accountantStats(schoolId) {
  const [[fin]] = await db.execute(
    `SELECT COALESCE(SUM(amount),0) as total,
       COALESCE(SUM(CASE WHEN status='paid' THEN amount ELSE 0 END),0) as collected,
       COALESCE(SUM(CASE WHEN status='pending' THEN amount ELSE 0 END),0) as pending,
       COALESCE(SUM(CASE WHEN status='overdue' THEN amount ELSE 0 END),0) as overdue,
       COUNT(CASE WHEN status='pending' THEN 1 END) as pending_count,
       COUNT(CASE WHEN status='overdue' THEN 1 END) as overdue_count,
       COUNT(CASE WHEN status='paid' THEN 1 END) as paid_count
     FROM invoices WHERE school_id=?`, [schoolId]);

  const [byType] = await db.execute(
    `SELECT type,
       COALESCE(SUM(CASE WHEN status='paid' THEN amount ELSE 0 END),0) as collected,
       COALESCE(SUM(CASE WHEN status IN('pending','overdue') THEN amount ELSE 0 END),0) as pending,
       COUNT(*) as count
     FROM invoices WHERE school_id=?
     GROUP BY type ORDER BY collected DESC`, [schoolId]);

  const [recentInvoices] = await db.execute(
    `SELECT i.*, CONCAT(s.first_name,' ',s.last_name) as student_name
     FROM invoices i JOIN students s ON i.student_id=s.id
     WHERE i.school_id=?
     ORDER BY i.created_at DESC LIMIT 10`, [schoolId]);

  const [monthlyTrend] = await db.execute(
    `SELECT DATE_FORMAT(paid_at, '%Y-%m') as month,
       SUM(amount) as collected, COUNT(*) as count
     FROM invoices WHERE school_id=? AND status='paid' AND paid_at IS NOT NULL
     GROUP BY month ORDER BY month DESC LIMIT 6`, [schoolId]);

  const currentMonth = new Date().toISOString().slice(0, 7);
  const [[payroll]] = await db.execute(
    `SELECT COALESCE(SUM(net_amount),0) as total_net,
       SUM(CASE WHEN status='paid' THEN 1 ELSE 0 END) as paid_count,
       SUM(CASE WHEN status='draft' THEN 1 ELSE 0 END) as draft_count
     FROM payslips WHERE school_id=? AND period_month=?`, [schoolId, currentMonth]);

  return {
    counters: { total: fin.total, collected: fin.collected, pending: fin.pending,
                overdue: fin.overdue, pending_count: fin.pending_count,
                overdue_count: fin.overdue_count, paid_count: fin.paid_count },
    byType, recentInvoices,
    monthlyTrend: monthlyTrend.reverse(),
    payroll: { total_net: payroll.total_net || 0, paid_count: payroll.paid_count || 0, draft_count: payroll.draft_count || 0, period_month: currentMonth },
  };
}

async function secretaryStats(schoolId, userId) {
  const [[students]] = await db.execute("SELECT COUNT(*) as total FROM students WHERE school_id=? AND status!='archive'", [schoolId]);
  const [recentStudents] = await db.execute(
    `SELECT id, first_name, last_name, matricule, created_at FROM students
     WHERE school_id=? ORDER BY created_at DESC LIMIT 8`, [schoolId]);
  const [[unreadMsg]] = await db.execute(
    `SELECT COUNT(*) as count FROM message_recipients mr JOIN messages m ON mr.message_id=m.id
     WHERE mr.recipient_id=? AND mr.read_at IS NULL`, [userId]);

  return {
    counters: { students: students.total, unread_messages: unreadMsg.count },
    recentStudents,
  };
}

async function counselorStats(schoolId) {
  const today = new Date().toISOString().split('T')[0];

  const [attendanceByClass] = await db.execute(
    `SELECT c.name as class_name, c.id as class_id,
       COUNT(a.id) as recorded,
       COALESCE(SUM(CASE WHEN a.status='present' THEN 1 ELSE 0 END),0) as present,
       COALESCE(SUM(CASE WHEN a.status='absent' THEN 1 ELSE 0 END),0) as absent,
       COALESCE(SUM(CASE WHEN a.status='retard' THEN 1 ELSE 0 END),0) as late
     FROM classes c
     LEFT JOIN attendance a ON a.class_id=c.id AND a.date=?
     WHERE c.school_id=?
     GROUP BY c.id ORDER BY c.name`, [today, schoolId]);

  const [absentToday] = await db.execute(
    `SELECT a.*, CONCAT(s.first_name,' ',s.last_name) as student_name,
            c.name as class_name
     FROM attendance a
     JOIN students s ON a.student_id=s.id
     JOIN classes c ON a.class_id=c.id
     WHERE s.school_id=? AND a.date=? AND a.status='absent'
     ORDER BY c.name, s.last_name`, [schoolId, today]);

  const [[todaySummary]] = await db.execute(
    `SELECT COUNT(*) as total,
       COALESCE(SUM(CASE WHEN a.status='present' THEN 1 ELSE 0 END),0) as present,
       COALESCE(SUM(CASE WHEN a.status='absent' THEN 1 ELSE 0 END),0) as absent,
       COALESCE(SUM(CASE WHEN a.status='retard' THEN 1 ELSE 0 END),0) as late
     FROM attendance a JOIN students s ON a.student_id=s.id
     WHERE s.school_id=? AND a.date=?`, [schoolId, today]);

  const [trend] = await db.execute(
    `SELECT a.date,
       COUNT(*) as total,
       SUM(CASE WHEN a.status='present' THEN 1 ELSE 0 END) as present,
       SUM(CASE WHEN a.status='absent' THEN 1 ELSE 0 END) as absent
     FROM attendance a JOIN students s ON a.student_id=s.id
     WHERE s.school_id=? AND a.date >= DATE_SUB(CURDATE(), INTERVAL 7 DAY)
     GROUP BY a.date ORDER BY a.date`, [schoolId]);

  return { todaySummary, attendanceByClass, absentToday, trend };
}

// ── Main endpoint ─────────────────────────────────────────────────────────────

exports.getStats = async (req, res) => {
  try {
    const { id: userId, school_id: schoolId, role } = req.user;

    let data;
    switch (role) {
      case 'super_admin':
      case 'director':
        data = await directorStats(schoolId, userId);
        break;
      case 'teacher':
        data = await teacherStats(userId, schoolId);
        break;
      case 'parent':
        data = await parentStats(userId, schoolId);
        break;
      case 'accountant':
        data = await accountantStats(schoolId);
        break;
      case 'counselor':
        data = await counselorStats(schoolId);
        break;
      case 'secretary':
        data = await secretaryStats(schoolId, userId);
        break;
      default:
        // librarian, nurse, maintenance, student → dashboard minimaliste
        const [[unread]] = await db.execute(
          `SELECT COUNT(*) as count FROM message_recipients mr JOIN messages m ON mr.message_id=m.id
           WHERE mr.recipient_id=? AND mr.read_at IS NULL`, [userId]);
        data = { counters: { unread_messages: unread.count } };
    }

    res.json({ success: true, role, data });
  } catch (err) {
    handleError(res, err);
  }
};
