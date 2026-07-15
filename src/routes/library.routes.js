const router = require('express').Router();
const { authenticate, requirePermission } = require('../middleware/auth');
const ctrl = require('../controllers/library.controller');

router.get('/books',        authenticate, requirePermission('library.read'),  ctrl.getBooks);
router.post('/books',       authenticate, requirePermission('library.write'), ctrl.createBook);
router.put('/books/:id',    authenticate, requirePermission('library.write'), ctrl.updateBook);
router.delete('/books/:id', authenticate, requirePermission('library.write'), ctrl.deleteBook);

router.get('/loans',           authenticate, requirePermission('library.read'),  ctrl.getLoans);
router.post('/loans',          authenticate, requirePermission('library.write'), ctrl.createLoan);
router.put('/loans/:id/return',authenticate, requirePermission('library.write'), ctrl.returnLoan);

module.exports = router;
