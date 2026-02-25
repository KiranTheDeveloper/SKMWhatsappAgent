const express = require('express');
const path = require('path');
const router = express.Router();
const { requireAuth, handleLogin, handleLogout } = require('./auth');
const { addClient } = require('./sseManager');
const { broadcastToSSE } = require('./sseManager');
const { sendTextMessage } = require('../whatsapp/sender');
const {
  getAllConversationsForDashboard,
  getConversationById,
  getMessagesByConversation,
  getDocumentsByConversation,
  setConversationMode,
  updateConversation,
  saveMessage,
  getCustomerById,
} = require('../db/queries');

// ── Auth routes ────────────────────────────────────────────────────────────
router.get('/login', (req, res) => {
  res.sendFile(path.join(__dirname, '../../public/dashboard/index.html'));
});
router.post('/login', handleLogin);
router.get('/logout', handleLogout);

// ── App (protected) ────────────────────────────────────────────────────────
router.get('/', (req, res) => res.redirect('/dashboard/app'));
router.get('/app', requireAuth, (req, res) => {
  res.sendFile(path.join(__dirname, '../../public/dashboard/app.html'));
});

// ── SSE stream ─────────────────────────────────────────────────────────────
router.get('/events', requireAuth, (req, res) => {
  addClient(res);
});

// ── API Routes ─────────────────────────────────────────────────────────────
router.get('/api/conversations', requireAuth, (req, res) => {
  const conversations = getAllConversationsForDashboard();
  res.json(conversations);
});

router.get('/api/conversations/:id', requireAuth, (req, res) => {
  const conversation = getConversationById(req.params.id);
  if (!conversation) return res.status(404).json({ error: 'Not found' });

  const messages = getMessagesByConversation(req.params.id);
  const documents = getDocumentsByConversation(req.params.id);
  const customer = getCustomerById(conversation.customer_id);

  res.json({ conversation, messages, documents, customer });
});

router.post('/api/conversations/:id/takeover', requireAuth, (req, res) => {
  const { id } = req.params;
  const agentName = req.body.agentName || req.session.agentName || 'Agent';

  const conversation = getConversationById(id);
  if (!conversation) return res.status(404).json({ error: 'Not found' });

  setConversationMode(id, 'human', agentName);
  updateConversation(id, { status: 'human_takeover', takeover_reason: 'agent_takeover' });

  broadcastToSSE({ type: 'mode_changed', conversationId: id, mode: 'human', agent: agentName });
  res.json({ success: true });
});

router.post('/api/conversations/:id/handback', requireAuth, (req, res) => {
  const { id } = req.params;

  const conversation = getConversationById(id);
  if (!conversation) return res.status(404).json({ error: 'Not found' });

  setConversationMode(id, 'bot', null);
  updateConversation(id, { status: 'active' });

  broadcastToSSE({ type: 'mode_changed', conversationId: id, mode: 'bot' });
  res.json({ success: true });
});

router.post('/api/conversations/:id/send', requireAuth, async (req, res) => {
  const { id } = req.params;
  const { text } = req.body;

  if (!text || !text.trim()) return res.status(400).json({ error: 'Text required' });

  const conversation = getConversationById(id);
  if (!conversation) return res.status(404).json({ error: 'Not found' });
  if (conversation.mode !== 'human') return res.status(400).json({ error: 'Not in human mode' });

  const customer = getCustomerById(conversation.customer_id);

  try {
    await sendTextMessage(customer.whatsapp_number, text);
  } catch (err) {
    console.error('WhatsApp send error:', err.message);
    return res.status(500).json({ error: 'Failed to send WhatsApp message' });
  }

  // Save to DB
  saveMessage(id, 'outbound', 'human_agent', 'text', text, null, null);

  // Add to GPT history so bot has context when it resumes
  const gptMessages = JSON.parse(conversation.gpt_messages || '[]');
  gptMessages.push({ role: 'assistant', content: `[Human Agent ${req.session.agentName || 'Agent'}]: ${text}` });
  updateConversation(id, { gpt_messages: JSON.stringify(gptMessages) });

  broadcastToSSE({
    type: 'new_message',
    conversationId: id,
    direction: 'outbound',
    senderType: 'human_agent',
    content: text,
  });

  res.json({ success: true });
});

module.exports = router;
