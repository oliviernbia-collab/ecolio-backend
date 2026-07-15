-- Migration v3 : Colonne type pour les factures + threading pour la messagerie
-- À exécuter UNE SEULE FOIS dans phpMyAdmin ou via mysql CLI

-- 1. Colonne type dans invoices
ALTER TABLE invoices
  ADD COLUMN type ENUM('scolarite','transport','cantine','uniforme','activite','autre')
  NOT NULL DEFAULT 'scolarite' AFTER student_id;

-- 2. Threading pour les messages (réponses)
ALTER TABLE messages
  ADD COLUMN parent_message_id INT NULL DEFAULT NULL AFTER content;

ALTER TABLE messages
  ADD CONSTRAINT fk_messages_parent
  FOREIGN KEY (parent_message_id) REFERENCES messages(id) ON DELETE SET NULL;
