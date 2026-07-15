-- Migration v10 : module Bibliothèque
-- À exécuter UNE SEULE FOIS : mysql -u root -p ecolio < migration_v10.sql

CREATE TABLE IF NOT EXISTS books (
  id              INT PRIMARY KEY AUTO_INCREMENT,
  school_id       INT NOT NULL,
  title           VARCHAR(255) NOT NULL,
  author          VARCHAR(255),
  isbn            VARCHAR(50),
  category        VARCHAR(100),
  total_copies    INT NOT NULL DEFAULT 1,
  available_copies INT NOT NULL DEFAULT 1,
  created_at      TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (school_id) REFERENCES schools(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS book_loans (
  id           INT PRIMARY KEY AUTO_INCREMENT,
  school_id    INT NOT NULL,
  book_id      INT NOT NULL,
  student_id   INT NULL,
  staff_id     INT NULL,
  borrowed_at  DATE NOT NULL,
  due_date     DATE NOT NULL,
  returned_at  DATE NULL,
  status       ENUM('emprunte','rendu','perdu') NOT NULL DEFAULT 'emprunte',
  recorded_by  INT,
  created_at   TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (school_id)  REFERENCES schools(id)  ON DELETE CASCADE,
  FOREIGN KEY (book_id)    REFERENCES books(id)    ON DELETE CASCADE,
  FOREIGN KEY (student_id) REFERENCES students(id) ON DELETE CASCADE,
  FOREIGN KEY (staff_id)   REFERENCES staff(id)    ON DELETE CASCADE,
  FOREIGN KEY (recorded_by) REFERENCES users(id)   ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS idx_books_school       ON books(school_id);
CREATE INDEX IF NOT EXISTS idx_book_loans_school  ON book_loans(school_id, status);
CREATE INDEX IF NOT EXISTS idx_book_loans_book    ON book_loans(book_id);

INSERT IGNORE INTO permissions (code, label, module) VALUES
  ('library.read',  'Consulter le catalogue et les emprunts', 'library'),
  ('library.write', 'Gérer les livres et les emprunts',        'library');

INSERT IGNORE INTO role_permissions (role_code, permission_code) VALUES
  ('super_admin','library.read'),('super_admin','library.write'),
  ('director','library.read'),('director','library.write'),
  ('librarian','library.read'),('librarian','library.write'),
  ('teacher','library.read'),
  ('secretary','library.read');
