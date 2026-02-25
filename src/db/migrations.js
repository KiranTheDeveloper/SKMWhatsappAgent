function runMigrations(db) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS customers (
      id                INTEGER PRIMARY KEY AUTOINCREMENT,
      whatsapp_number   TEXT NOT NULL UNIQUE,
      name              TEXT,
      email             TEXT,
      city              TEXT,
      drive_folder_id   TEXT,
      drive_folder_url  TEXT,
      created_at        DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at        DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS conversations (
      id                INTEGER PRIMARY KEY AUTOINCREMENT,
      customer_id       INTEGER NOT NULL REFERENCES customers(id),
      service_type      TEXT,
      status            TEXT DEFAULT 'active',
      mode              TEXT DEFAULT 'bot',
      assigned_agent    TEXT,
      stage             TEXT DEFAULT 'greeting',
      collected_data    TEXT DEFAULT '{}',
      gpt_messages      TEXT DEFAULT '[]',
      takeover_reason   TEXT,
      created_at        DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at        DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS messages (
      id                INTEGER PRIMARY KEY AUTOINCREMENT,
      conversation_id   INTEGER NOT NULL REFERENCES conversations(id),
      direction         TEXT NOT NULL,
      sender_type       TEXT NOT NULL,
      message_type      TEXT NOT NULL,
      content           TEXT,
      whatsapp_msg_id   TEXT,
      media_id          TEXT,
      created_at        DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS documents (
      id                INTEGER PRIMARY KEY AUTOINCREMENT,
      customer_id       INTEGER NOT NULL REFERENCES customers(id),
      conversation_id   INTEGER NOT NULL REFERENCES conversations(id),
      document_type     TEXT NOT NULL,
      original_filename TEXT,
      drive_file_id     TEXT,
      drive_file_url    TEXT,
      whatsapp_media_id TEXT,
      mime_type         TEXT,
      uploaded_at       DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE INDEX IF NOT EXISTS idx_messages_whatsapp_msg_id ON messages(whatsapp_msg_id);
    CREATE INDEX IF NOT EXISTS idx_conversations_customer_id ON conversations(customer_id);
    CREATE INDEX IF NOT EXISTS idx_documents_customer_id ON documents(customer_id);
  `);
}

module.exports = { runMigrations };
