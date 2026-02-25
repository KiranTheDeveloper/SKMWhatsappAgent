const { getDb } = require('./index');

// ── Customers ──────────────────────────────────────────────────────────────

function getOrCreateCustomer(whatsappNumber) {
  const db = getDb();
  let customer = db.prepare('SELECT * FROM customers WHERE whatsapp_number = ?').get(whatsappNumber);
  if (!customer) {
    const result = db.prepare(
      'INSERT INTO customers (whatsapp_number) VALUES (?)'
    ).run(whatsappNumber);
    customer = db.prepare('SELECT * FROM customers WHERE id = ?').get(result.lastInsertRowid);
  }
  return customer;
}

function updateCustomer(customerId, fields) {
  const db = getDb();
  const allowed = ['name', 'email', 'city', 'drive_folder_id', 'drive_folder_url'];
  const updates = Object.keys(fields).filter(k => allowed.includes(k));
  if (updates.length === 0) return;
  const setClause = updates.map(k => `${k} = @${k}`).join(', ');
  db.prepare(`UPDATE customers SET ${setClause}, updated_at = CURRENT_TIMESTAMP WHERE id = @id`)
    .run({ ...fields, id: customerId });
}

function getCustomerById(customerId) {
  return getDb().prepare('SELECT * FROM customers WHERE id = ?').get(customerId);
}

// ── Conversations ──────────────────────────────────────────────────────────

function getActiveConversation(customerId) {
  return getDb().prepare(
    "SELECT * FROM conversations WHERE customer_id = ? AND status NOT IN ('completed', 'abandoned') ORDER BY created_at DESC LIMIT 1"
  ).get(customerId);
}

function createConversation(customerId) {
  const db = getDb();
  const result = db.prepare(
    'INSERT INTO conversations (customer_id) VALUES (?)'
  ).run(customerId);
  return db.prepare('SELECT * FROM conversations WHERE id = ?').get(result.lastInsertRowid);
}

function updateConversation(conversationId, fields) {
  const db = getDb();
  const allowed = ['service_type', 'status', 'mode', 'assigned_agent', 'stage',
                   'collected_data', 'gpt_messages', 'takeover_reason'];
  const updates = Object.keys(fields).filter(k => allowed.includes(k));
  if (updates.length === 0) return;
  const setClause = updates.map(k => `${k} = @${k}`).join(', ');
  db.prepare(`UPDATE conversations SET ${setClause}, updated_at = CURRENT_TIMESTAMP WHERE id = @id`)
    .run({ ...fields, id: conversationId });
}

function updateConversationStage(conversationId, stage, collectedData) {
  getDb().prepare(
    'UPDATE conversations SET stage = ?, collected_data = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?'
  ).run(stage, JSON.stringify(collectedData), conversationId);
}

function setConversationMode(conversationId, mode, agentName) {
  getDb().prepare(
    'UPDATE conversations SET mode = ?, assigned_agent = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?'
  ).run(mode, agentName, conversationId);
}

function getAllConversationsForDashboard() {
  return getDb().prepare(`
    SELECT c.*, cu.whatsapp_number, cu.name as customer_name, cu.drive_folder_url,
           (SELECT content FROM messages WHERE conversation_id = c.id ORDER BY created_at DESC LIMIT 1) as last_message,
           (SELECT created_at FROM messages WHERE conversation_id = c.id ORDER BY created_at DESC LIMIT 1) as last_message_at,
           (SELECT COUNT(*) FROM documents WHERE conversation_id = c.id) as document_count
    FROM conversations c
    JOIN customers cu ON cu.id = c.customer_id
    ORDER BY c.updated_at DESC
  `).all();
}

function getConversationById(conversationId) {
  return getDb().prepare('SELECT * FROM conversations WHERE id = ?').get(conversationId);
}

// ── Messages ───────────────────────────────────────────────────────────────

function saveMessage(conversationId, direction, senderType, messageType, content, whatsappMsgId, mediaId) {
  const db = getDb();
  const result = db.prepare(
    'INSERT INTO messages (conversation_id, direction, sender_type, message_type, content, whatsapp_msg_id, media_id) VALUES (?, ?, ?, ?, ?, ?, ?)'
  ).run(conversationId, direction, senderType, messageType, content, whatsappMsgId, mediaId);
  return db.prepare('SELECT * FROM messages WHERE id = ?').get(result.lastInsertRowid);
}

function getMessagesByConversation(conversationId) {
  return getDb().prepare(
    'SELECT * FROM messages WHERE conversation_id = ? ORDER BY created_at ASC'
  ).all(conversationId);
}

function messageAlreadyProcessed(whatsappMsgId) {
  if (!whatsappMsgId) return false;
  const row = getDb().prepare('SELECT id FROM messages WHERE whatsapp_msg_id = ?').get(whatsappMsgId);
  return !!row;
}

// ── Documents ─────────────────────────────────────────────────────────────

function saveDocument(customerId, conversationId, documentType, filename, driveFileId, driveFileUrl, mediaId, mimeType) {
  const db = getDb();
  const result = db.prepare(
    'INSERT INTO documents (customer_id, conversation_id, document_type, original_filename, drive_file_id, drive_file_url, whatsapp_media_id, mime_type) VALUES (?, ?, ?, ?, ?, ?, ?, ?)'
  ).run(customerId, conversationId, documentType, filename, driveFileId, driveFileUrl, mediaId, mimeType);
  return db.prepare('SELECT * FROM documents WHERE id = ?').get(result.lastInsertRowid);
}

function getDocumentsByConversation(conversationId) {
  return getDb().prepare('SELECT * FROM documents WHERE conversation_id = ? ORDER BY uploaded_at ASC').all(conversationId);
}

function getDocumentsByCustomer(customerId) {
  return getDb().prepare('SELECT * FROM documents WHERE customer_id = ? ORDER BY uploaded_at ASC').all(customerId);
}

module.exports = {
  getOrCreateCustomer, updateCustomer, getCustomerById,
  getActiveConversation, createConversation, updateConversation,
  updateConversationStage, setConversationMode, getAllConversationsForDashboard, getConversationById,
  saveMessage, getMessagesByConversation, messageAlreadyProcessed,
  saveDocument, getDocumentsByConversation, getDocumentsByCustomer,
};
