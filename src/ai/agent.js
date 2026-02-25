const OpenAI = require('openai');
const { updateConversation, setConversationMode } = require('../db/queries');
const { buildSystemPrompt } = require('./systemPrompt');
const { advanceStageIfReady } = require('./stateManager');
const { broadcastToSSE } = require('../dashboard/sseManager');

async function processWithAgent(customer, conversation, userInput) {
  const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

  // Load GPT message history
  let gptMessages = JSON.parse(conversation.gpt_messages || '[]');

  // Build system prompt with current state
  const systemPrompt = buildSystemPrompt(customer, conversation);

  // Append new user message
  const userContent = userInput || '[Customer sent a document or image]';
  gptMessages.push({ role: 'user', content: userContent });

  // Keep context manageable — last 30 messages
  const trimmed = gptMessages.slice(-30);

  // Call GPT-4o
  let replyText = '';
  try {
    const response = await openai.chat.completions.create({
      model: process.env.OPENAI_MODEL || 'gpt-4o',
      messages: [
        { role: 'system', content: systemPrompt },
        ...trimmed,
      ],
      temperature: 0.7,
      max_tokens: 600,
    });
    replyText = response.choices[0].message.content || '';
  } catch (err) {
    console.error('OpenAI error:', err.message);
    replyText = 'I apologize, I am having a technical issue. Please try again in a moment.';
  }

  // Check for handoff signal
  const handoffRequested = replyText.includes('[HANDOFF_REQUESTED]');
  const cleanReply = replyText.replace('[HANDOFF_REQUESTED]', '').trim();

  // Append assistant reply to history
  gptMessages.push({ role: 'assistant', content: cleanReply });

  // Advance conversation stage based on what was said
  try {
    await advanceStageIfReady(customer, conversation, userContent, cleanReply);
  } catch (err) {
    console.error('Stage advancement error:', err.message);
  }

  // Handle handoff
  if (handoffRequested) {
    await setConversationMode(conversation.id, 'human', null);
    await updateConversation(conversation.id, {
      status: 'human_takeover',
      takeover_reason: 'customer_requested',
    });
    broadcastToSSE({
      type: 'takeover_needed',
      conversationId: conversation.id,
      customerNumber: customer.whatsapp_number,
      customerName: customer.name || customer.whatsapp_number,
    });
  }

  // Persist updated message history
  await updateConversation(conversation.id, { gpt_messages: JSON.stringify(gptMessages) });

  return cleanReply;
}

module.exports = { processWithAgent };
