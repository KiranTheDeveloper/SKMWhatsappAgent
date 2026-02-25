const axios = require('axios');

const MIME_TO_EXT = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
  'application/pdf': 'pdf',
  'application/msword': 'doc',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document': 'docx',
  'audio/ogg': 'ogg',
  'audio/mpeg': 'mp3',
};

function mimeToExtension(mimeType) {
  return MIME_TO_EXT[mimeType] || 'bin';
}

async function downloadMedia(mediaId) {
  const headers = { Authorization: `Bearer ${process.env.WHATSAPP_ACCESS_TOKEN}` };
  const version = process.env.WHATSAPP_API_VERSION || 'v19.0';

  // Step 1: Get media URL from Meta
  const metaRes = await axios.get(
    `https://graph.facebook.com/${version}/${mediaId}`,
    { headers }
  );
  const mediaUrl = metaRes.data.url;
  const mimeType = metaRes.data.mime_type;

  // Step 2: Download binary
  const fileRes = await axios.get(mediaUrl, {
    headers,
    responseType: 'arraybuffer',
  });

  return {
    buffer: Buffer.from(fileRes.data),
    mimeType: mimeType || fileRes.headers['content-type'] || 'application/octet-stream',
  };
}

module.exports = { downloadMedia, mimeToExtension };
