const db = require('../config/database');
const { handleError } = require('../utils/errors');

// ── Livres ───────────────────────────────────────────────────────────────────

exports.getBooks = async (req, res) => {
  try {
    const { search, category } = req.query;
    let query = 'SELECT * FROM books WHERE school_id=?';
    const params = [req.user.school_id];
    if (search)   { query += ' AND (title LIKE ? OR author LIKE ? OR isbn LIKE ?)'; params.push(`%${search}%`, `%${search}%`, `%${search}%`); }
    if (category) { query += ' AND category=?'; params.push(category); }
    query += ' ORDER BY title';
    const [rows] = await db.execute(query, params);
    res.json({ success: true, data: rows });
  } catch (err) { handleError(res, err); }
};

exports.createBook = async (req, res) => {
  try {
    const { title, author, isbn, category, total_copies } = req.body;
    if (!title) return res.status(400).json({ success: false, message: 'Le titre est requis' });
    const copies = parseInt(total_copies) || 1;
    const [result] = await db.execute(
      'INSERT INTO books (school_id, title, author, isbn, category, total_copies, available_copies) VALUES (?,?,?,?,?,?,?)',
      [req.user.school_id, title, author || null, isbn || null, category || null, copies, copies]
    );
    res.status(201).json({ success: true, id: result.insertId });
  } catch (err) { handleError(res, err); }
};

exports.updateBook = async (req, res) => {
  try {
    const [existing] = await db.execute('SELECT total_copies, available_copies FROM books WHERE id=? AND school_id=?', [req.params.id, req.user.school_id]);
    if (!existing.length) return res.status(404).json({ success: false, message: 'Livre non trouvé' });

    const { title, author, isbn, category, total_copies } = req.body;
    const newTotal = parseInt(total_copies) || existing[0].total_copies;
    const delta = newTotal - existing[0].total_copies;
    const newAvailable = Math.max(0, existing[0].available_copies + delta);

    await db.execute(
      'UPDATE books SET title=?, author=?, isbn=?, category=?, total_copies=?, available_copies=? WHERE id=? AND school_id=?',
      [title, author || null, isbn || null, category || null, newTotal, newAvailable, req.params.id, req.user.school_id]
    );
    res.json({ success: true, message: 'Livre mis à jour' });
  } catch (err) { handleError(res, err); }
};

exports.deleteBook = async (req, res) => {
  try {
    await db.execute('DELETE FROM books WHERE id=? AND school_id=?', [req.params.id, req.user.school_id]);
    res.json({ success: true, message: 'Livre supprimé' });
  } catch (err) { handleError(res, err); }
};

// ── Emprunts ─────────────────────────────────────────────────────────────────

exports.getLoans = async (req, res) => {
  try {
    const { status } = req.query;
    let query = `
      SELECT bl.*, b.title as book_title, b.author as book_author,
             CONCAT(s.first_name,' ',s.last_name) as student_name,
             CONCAT(u.first_name,' ',u.last_name) as staff_name
      FROM book_loans bl
      JOIN books b ON bl.book_id=b.id
      LEFT JOIN students s ON bl.student_id=s.id
      LEFT JOIN staff st ON bl.staff_id=st.id
      LEFT JOIN users u ON st.user_id=u.id
      WHERE bl.school_id=?`;
    const params = [req.user.school_id];
    if (status) { query += ' AND bl.status=?'; params.push(status); }
    query += ' ORDER BY bl.borrowed_at DESC';
    const [rows] = await db.execute(query, params);
    res.json({ success: true, data: rows });
  } catch (err) { handleError(res, err); }
};

exports.createLoan = async (req, res) => {
  try {
    const { book_id, student_id, staff_id, due_date } = req.body;
    if (!book_id || (!student_id && !staff_id) || !due_date) {
      return res.status(400).json({ success: false, message: 'Livre, emprunteur et date de retour sont requis' });
    }
    const [book] = await db.execute('SELECT available_copies FROM books WHERE id=? AND school_id=?', [book_id, req.user.school_id]);
    if (!book.length) return res.status(404).json({ success: false, message: 'Livre non trouvé' });
    if (book[0].available_copies < 1) return res.status(400).json({ success: false, message: 'Aucun exemplaire disponible' });

    if (student_id) {
      const [s] = await db.execute('SELECT id FROM students WHERE id=? AND school_id=?', [student_id, req.user.school_id]);
      if (!s.length) return res.status(404).json({ success: false, message: 'Élève non trouvé' });
    }
    if (staff_id) {
      const [s] = await db.execute('SELECT id FROM staff WHERE id=? AND school_id=?', [staff_id, req.user.school_id]);
      if (!s.length) return res.status(404).json({ success: false, message: 'Membre du personnel non trouvé' });
    }

    const [result] = await db.execute(
      'INSERT INTO book_loans (school_id, book_id, student_id, staff_id, borrowed_at, due_date, recorded_by) VALUES (?,?,?,?,CURDATE(),?,?)',
      [req.user.school_id, book_id, student_id || null, staff_id || null, due_date, req.user.id]
    );
    await db.execute('UPDATE books SET available_copies = available_copies - 1 WHERE id=?', [book_id]);
    res.status(201).json({ success: true, id: result.insertId });
  } catch (err) { handleError(res, err); }
};

exports.returnLoan = async (req, res) => {
  try {
    const [loan] = await db.execute('SELECT book_id, status FROM book_loans WHERE id=? AND school_id=?', [req.params.id, req.user.school_id]);
    if (!loan.length) return res.status(404).json({ success: false, message: 'Emprunt non trouvé' });
    if (loan[0].status !== 'emprunte') return res.status(400).json({ success: false, message: 'Cet emprunt est déjà clôturé' });

    const { lost } = req.body;
    const status = lost ? 'perdu' : 'rendu';
    await db.execute("UPDATE book_loans SET status=?, returned_at=CURDATE() WHERE id=?", [status, req.params.id]);
    if (!lost) {
      await db.execute('UPDATE books SET available_copies = available_copies + 1 WHERE id=?', [loan[0].book_id]);
    }
    res.json({ success: true, message: lost ? 'Livre marqué perdu' : 'Livre rendu' });
  } catch (err) { handleError(res, err); }
};
