const {
  getOrCreateCustomer, getCustomerById, updateCustomer,
  getActiveConversation, createConversation,
  saveMessage, messageAlreadyProcessed,
  saveDocument, getDocumentsByConversation,
} = require('../db/queries');
const { sendTextMessage } = require('./sender');
const { downloadMedia, mimeToExtension } = require('./mediaDownloader');
const { processWithAgent } = require('../ai/agent');
const { createCustomerFolder } = require('../drive/folderManager');
const { uploadDocument } = require('../drive/uploader');
const { broadcastToSSE } = require('../dashboard/sseManager');

async function handleIncomingWebhook(req, res) {
  // Always respond 200 immediately — Meta requires fast acknowledgment
  res.sendStatus(200);

  const body = req.body;
  if (body.object !== 'whatsapp_business_account') return;

  for (const entry of (body.entry || [])) {
    for (const change of (entry.changes || [])) {
      if (change.field !== 'messages') continue;

      const value = change.value;
      if (!value.messages || value.messages.length === 0) continue;

      const msg = value.messages[0];
      const waNumber = msg.from;

      // Deduplication
      if (messageAlreadyProcessed(msg.id)) {
        console.log(`Duplicate message ${msg.id}, skipping`);
        continue;
      }

      // Process async — don't await in the webhook handler directly
      processMessage(waNumber, msg).catch(err => {
        console.error(`Error processing message from ${waNumber}:`, err);
      });
    }
  }
}

async function processMessage(waNumber, msg) {
  const customer = getOrCreateCustomer(waNumber);

  let conversation = getActiveConversation(customer.id);
  if (!conversation) {
    conversation = createConversation(customer.id);
  }

  // Extract message content
  const msgType = msg.type; // text | image | document | audio | video
  const textContent = msg.text?.body
    || msg.document?.caption
    || msg.image?.caption
    || msg.video?.caption
    || '';
  const mediaId = msg.image?.id || msg.document?.id || msg.audio?.id || msg.video?.id || null;
  const originalFilename = msg.document?.filename || null;

  // Save inbound message
  saveMessage(conversation.id, 'inbound', 'customer', msgType, textContent, msg.id, mediaId);

  // If human is handling — just broadcast to dashboard, no bot reply
  if (conversation.mode === 'human') {
    broadcastToSSE({
      type: 'new_message',
      conversationId: conversation.id,
      customerNumber: waNumber,
      content: textContent || '[media]',
      direction: 'inbound',
    });
    return;
  }

  // Refresh customer (may have been updated by a concurrent call)
  const freshCustomer = getCustomerById(customer.id);

  // Handle incoming media — download and upload to Drive
  let docTypeForMedia = null;
  if (mediaId && ['image', 'document'].includes(msgType)) {
    docTypeForMedia = await handleIncomingMedia(freshCustomer, conversation, msg, mediaId, msgType, originalFilename);
  }

  // Build input for agent (include doc acknowledgement context if applicable)
  const agentInput = docTypeForMedia
    ? `[Customer sent a document: ${docTypeForMedia}]${textContent ? ' ' + textContent : ''}`
    : textContent;

  // Get bot reply
  const reply = await processWithAgent(freshCustomer, conversation, agentInput);

  if (reply) {
    await sendTextMessage(waNumber, reply);
    saveMessage(conversation.id, 'outbound', 'bot', 'text', reply, null, null);
    broadcastToSSE({
      type: 'new_message',
      conversationId: conversation.id,
      direction: 'outbound',
    });
  }
}

async function handleIncomingMedia(customer, conversation, msg, mediaId, msgType, originalFilename) {
  // Determine pending document type from conversation state
  const collectedData = JSON.parse(conversation.collected_data || '{}');
  const pendingDocs = collectedData.pending_documents || [];
  const serviceType = conversation.service_type;

  // Use first pending doc as the type, or 'unknown_document'
  const docType = pendingDocs[0] || `${msgType}_document`;

  try {
    // Ensure Drive folder exists
    let folderId = customer.drive_folder_id;
    if (!folderId) {
      const folder = await createCustomerFolder(customer, customer.name || customer.whatsapp_number);
      updateCustomer(customer.id, { drive_folder_id: folder.id, drive_folder_url: folder.url });
      folderId = folder.id;
    }

    // Download from WhatsApp
    const { buffer, mimeType } = await downloadMedia(mediaId);
    const ext = mimeToExtension(mimeType);
    const filename = originalFilename || `${docType}_${Date.now()}.${ext}`;

    // Upload to Drive
    const driveFile = await uploadDocument(folderId, filename, buffer, mimeType);

    // Save document record
    saveDocument(
      customer.id,
      conversation.id,
      docType,
      filename,
      driveFile.id,
      driveFile.url,
      mediaId,
      mimeType
    );

    // Remove this doc from pending list
    if (pendingDocs.length > 0) {
      const updatedPending = pendingDocs.slice(1);
      const updatedData = { ...collectedData, pending_documents: updatedPending };
      const { updateConversationStage } = require('../db/queries');
      updateConversationStage(conversation.id, conversation.stage, updatedData);
    }

    console.log(`Document uploaded: ${filename} → Drive ${driveFile.id}`);
    return docType;
  } catch (err) {
    console.error('Media handling error:', err.message);
    return null;
  }
}

module.exports = { handleIncomingWebhook };
