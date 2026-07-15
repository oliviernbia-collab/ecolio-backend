-- Écolio Database Schema
-- Exécuter : mysql -u root -p < schema.sql

CREATE DATABASE IF NOT EXISTS ecolio CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
USE ecolio;

CREATE TABLE IF NOT EXISTS schools (
  id INT PRIMARY KEY AUTO_INCREMENT,
  name VARCHAR(255) NOT NULL,
  address TEXT,
  phone VARCHAR(50),
  email VARCHAR(255),
  logo_url VARCHAR(500),
  primary_color VARCHAR(7) DEFAULT '#1A3C5E',
  secondary_color VARCHAR(7) DEFAULT '#2E86AB',
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS users (
  id INT PRIMARY KEY AUTO_INCREMENT,
  school_id INT,
  first_name VARCHAR(100) NOT NULL,
  last_name VARCHAR(100) NOT NULL,
  email VARCHAR(255) UNIQUE NOT NULL,
  password VARCHAR(255) NOT NULL,
  must_change_password TINYINT(1) NOT NULL DEFAULT 0,
  role ENUM('super_admin','director','teacher','parent','student','accountant','secretary') NOT NULL,
  phone VARCHAR(50),
  avatar_url VARCHAR(500),
  is_active TINYINT(1) DEFAULT 1,
  last_login TIMESTAMP NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (school_id) REFERENCES schools(id) ON DELETE SET NULL
);

CREATE TABLE IF NOT EXISTS academic_years (
  id INT PRIMARY KEY AUTO_INCREMENT,
  school_id INT NOT NULL,
  name VARCHAR(20) NOT NULL,
  start_date DATE NOT NULL,
  end_date DATE NOT NULL,
  is_current TINYINT(1) DEFAULT 0,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (school_id) REFERENCES schools(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS classes (
  id INT PRIMARY KEY AUTO_INCREMENT,
  school_id INT NOT NULL,
  academic_year_id INT,
  name VARCHAR(50) NOT NULL,
  level VARCHAR(50),
  cycle ENUM('maternelle','primaire','secondaire') NOT NULL DEFAULT 'primaire',
  teacher_id INT,
  capacity INT DEFAULT 30,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (school_id) REFERENCES schools(id) ON DELETE CASCADE,
  FOREIGN KEY (teacher_id) REFERENCES users(id) ON DELETE SET NULL
);

CREATE TABLE IF NOT EXISTS students (
  id INT PRIMARY KEY AUTO_INCREMENT,
  school_id INT NOT NULL,
  academic_year_id INT,
  matricule VARCHAR(50) UNIQUE,
  first_name VARCHAR(100) NOT NULL,
  last_name VARCHAR(100) NOT NULL,
  birth_date DATE,
  birth_place VARCHAR(100),
  gender ENUM('M','F') NOT NULL DEFAULT 'M',
  photo_url VARCHAR(500),
  class_id INT,
  parent_id INT,
  status ENUM('pre_inscrit','inscrit','reinscrit','archive') DEFAULT 'inscrit',
  address TEXT,
  blood_type VARCHAR(5),
  medical_notes TEXT,
  emergency_contact_name VARCHAR(100),
  emergency_contact_phone VARCHAR(50),
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (school_id) REFERENCES schools(id) ON DELETE CASCADE,
  FOREIGN KEY (class_id) REFERENCES classes(id) ON DELETE SET NULL,
  FOREIGN KEY (parent_id) REFERENCES users(id) ON DELETE SET NULL
);

CREATE TABLE IF NOT EXISTS subjects (
  id INT PRIMARY KEY AUTO_INCREMENT,
  school_id INT NOT NULL,
  name VARCHAR(100) NOT NULL,
  code VARCHAR(20),
  coefficient DECIMAL(3,1) DEFAULT 1.0,
  class_id INT,
  teacher_id INT,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (school_id) REFERENCES schools(id) ON DELETE CASCADE,
  FOREIGN KEY (class_id) REFERENCES classes(id) ON DELETE SET NULL,
  FOREIGN KEY (teacher_id) REFERENCES users(id) ON DELETE SET NULL
);

CREATE TABLE IF NOT EXISTS grades (
  id INT PRIMARY KEY AUTO_INCREMENT,
  student_id INT NOT NULL,
  subject_id INT NOT NULL,
  academic_year_id INT,
  value DECIMAL(5,2) NOT NULL,
  max_value DECIMAL(5,2) DEFAULT 20,
  period ENUM('trimestre1','trimestre2','trimestre3','semestre1','semestre2') NOT NULL DEFAULT 'trimestre1',
  grade_type VARCHAR(50) DEFAULT 'devoir',
  comment TEXT,
  created_by INT,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (student_id) REFERENCES students(id) ON DELETE CASCADE,
  FOREIGN KEY (subject_id) REFERENCES subjects(id) ON DELETE CASCADE,
  FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE SET NULL
);

CREATE TABLE IF NOT EXISTS attendance (
  id INT PRIMARY KEY AUTO_INCREMENT,
  student_id INT NOT NULL,
  class_id INT NOT NULL,
  date DATE NOT NULL,
  status ENUM('present','absent','retard','sortie_anticipee') NOT NULL DEFAULT 'present',
  justified TINYINT(1) DEFAULT 0,
  justification TEXT,
  notified TINYINT(1) DEFAULT 0,
  recorded_by INT,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY unique_attendance (student_id, date),
  FOREIGN KEY (student_id) REFERENCES students(id) ON DELETE CASCADE,
  FOREIGN KEY (class_id) REFERENCES classes(id) ON DELETE CASCADE,
  FOREIGN KEY (recorded_by) REFERENCES users(id) ON DELETE SET NULL
);

CREATE TABLE IF NOT EXISTS rooms (
  id INT PRIMARY KEY AUTO_INCREMENT,
  school_id INT NOT NULL,
  name VARCHAR(100) NOT NULL,
  type ENUM('classe','informatique','sport','labo','autre') DEFAULT 'classe',
  capacity INT DEFAULT 30,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (school_id) REFERENCES schools(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS schedule (
  id INT PRIMARY KEY AUTO_INCREMENT,
  school_id INT NOT NULL,
  class_id INT NOT NULL,
  subject_id INT NOT NULL,
  teacher_id INT,
  room_id INT,
  academic_year_id INT,
  day_of_week TINYINT NOT NULL COMMENT '1=Lundi, 2=Mardi, 3=Mercredi, 4=Jeudi, 5=Vendredi',
  start_time TIME NOT NULL,
  end_time TIME NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (school_id) REFERENCES schools(id) ON DELETE CASCADE,
  FOREIGN KEY (class_id) REFERENCES classes(id) ON DELETE CASCADE,
  FOREIGN KEY (subject_id) REFERENCES subjects(id) ON DELETE CASCADE,
  FOREIGN KEY (teacher_id) REFERENCES users(id) ON DELETE SET NULL,
  FOREIGN KEY (room_id) REFERENCES rooms(id) ON DELETE SET NULL
);

CREATE TABLE IF NOT EXISTS staff (
  id INT PRIMARY KEY AUTO_INCREMENT,
  school_id INT NOT NULL,
  user_id INT NOT NULL,
  position VARCHAR(100),
  contract_type ENUM('CDI','CDD','vacataire','stagiaire') DEFAULT 'CDI',
  hire_date DATE,
  salary DECIMAL(12,2),
  is_active TINYINT(1) DEFAULT 1,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (school_id) REFERENCES schools(id) ON DELETE CASCADE,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS invoices (
  id INT PRIMARY KEY AUTO_INCREMENT,
  school_id INT NOT NULL,
  student_id INT NOT NULL,
  invoice_number VARCHAR(50) UNIQUE,
  amount DECIMAL(12,2) NOT NULL,
  type ENUM('scolarite','transport','cantine','uniforme','activite','autre') DEFAULT 'scolarite',
  description TEXT,
  due_date DATE,
  status ENUM('pending','paid','overdue','cancelled') DEFAULT 'pending',
  payment_method VARCHAR(50),
  paid_at TIMESTAMP NULL,
  created_by INT,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (school_id) REFERENCES schools(id) ON DELETE CASCADE,
  FOREIGN KEY (student_id) REFERENCES students(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS messages (
  id INT PRIMARY KEY AUTO_INCREMENT,
  school_id INT NOT NULL,
  sender_id INT NOT NULL,
  subject VARCHAR(255),
  content TEXT NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (school_id) REFERENCES schools(id) ON DELETE CASCADE,
  FOREIGN KEY (sender_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS message_recipients (
  id INT PRIMARY KEY AUTO_INCREMENT,
  message_id INT NOT NULL,
  recipient_id INT NOT NULL,
  read_at TIMESTAMP NULL,
  FOREIGN KEY (message_id) REFERENCES messages(id) ON DELETE CASCADE,
  FOREIGN KEY (recipient_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS notifications (
  id INT PRIMARY KEY AUTO_INCREMENT,
  user_id INT NOT NULL,
  school_id INT,
  title VARCHAR(255) NOT NULL,
  content TEXT,
  type ENUM('info','warning','success','absence','grade','finance','message') DEFAULT 'info',
  is_read TINYINT(1) DEFAULT 0,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  FOREIGN KEY (school_id) REFERENCES schools(id) ON DELETE CASCADE
);

-- Table documents pour la gestion documentaire
CREATE TABLE IF NOT EXISTS documents (
  id INT PRIMARY KEY AUTO_INCREMENT,
  school_id INT NOT NULL,
  student_id INT,
  uploaded_by INT NOT NULL,
  name VARCHAR(255) NOT NULL,
  type ENUM('bulletin','certificat','contrat','photo','identite','medical','autre') DEFAULT 'autre',
  file_path VARCHAR(500) NOT NULL,
  file_size INT,
  mime_type VARCHAR(100),
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (school_id) REFERENCES schools(id) ON DELETE CASCADE,
  FOREIGN KEY (student_id) REFERENCES students(id) ON DELETE CASCADE,
  FOREIGN KEY (uploaded_by) REFERENCES users(id) ON DELETE CASCADE
);

-- Indexes pour les requêtes fréquentes
CREATE INDEX IF NOT EXISTS idx_students_school    ON students(school_id);
CREATE INDEX IF NOT EXISTS idx_students_class     ON students(class_id);
CREATE INDEX IF NOT EXISTS idx_students_status    ON students(status);
CREATE INDEX IF NOT EXISTS idx_grades_student     ON grades(student_id);
CREATE INDEX IF NOT EXISTS idx_grades_subject     ON grades(subject_id);
CREATE INDEX IF NOT EXISTS idx_grades_period      ON grades(period);
CREATE INDEX IF NOT EXISTS idx_attendance_date    ON attendance(date);
CREATE INDEX IF NOT EXISTS idx_attendance_student ON attendance(student_id);
CREATE INDEX IF NOT EXISTS idx_attendance_class   ON attendance(class_id);
CREATE INDEX IF NOT EXISTS idx_invoices_status    ON invoices(status);
CREATE INDEX IF NOT EXISTS idx_invoices_student   ON invoices(student_id);
CREATE INDEX IF NOT EXISTS idx_invoices_due       ON invoices(due_date);
CREATE INDEX IF NOT EXISTS idx_notifications_user ON notifications(user_id, is_read);
CREATE INDEX IF NOT EXISTS idx_schedule_class     ON schedule(class_id, day_of_week);
