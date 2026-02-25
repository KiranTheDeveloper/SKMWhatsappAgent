const axios = require('axios');

function getBaseUrl() {
  return `https://graph.facebook.com/${process.env.WHATSAPP_API_VERSION}/${process.env.WHATSAPP_PHONE_NUMBER_ID}`;
}

function getHeaders() {
  return { Authorization: `Bearer ${process.env.WHATSAPP_ACCESS_TOKEN}` };
}

async function sendTextMessage(to, text) {
  // WhatsApp max message length is 4096 chars; split if needed
  const chunks = [];
  for (let i = 0; i < text.length; i += 4000) {
    chunks.push(text.slice(i, i + 4000));
  }

  for (const chunk of chunks) {
    await axios.post(`${getBaseUrl()}/messages`, {
      messaging_product: 'whatsapp',
      to,
      type: 'text',
      text: { body: chunk, preview_url: false },
    }, { headers: getHeaders() });
  }
}

async function sendTemplateMessage(to, templateName, languageCode = 'en', components = []) {
  await axios.post(`${getBaseUrl()}/messages`, {
    messaging_product: 'whatsapp',
    to,
    type: 'template',
    template: { name: templateName, language: { code: languageCode }, components },
  }, { headers: getHeaders() });
}

module.exports = { sendTextMessage, sendTemplateMessage };
