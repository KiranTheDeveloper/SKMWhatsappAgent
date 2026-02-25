const { Readable } = require('stream');
const { getDriveClient } = require('./auth');

async function uploadDocument(folderId, fileName, buffer, mimeType) {
  const drive = getDriveClient();

  const readable = new Readable();
  readable.push(buffer);
  readable.push(null);

  const file = await drive.files.create({
    requestBody: {
      name: fileName,
      parents: [folderId],
    },
    media: {
      mimeType,
      body: readable,
    },
    fields: 'id, webViewLink',
  });

  return {
    id: file.data.id,
    url: file.data.webViewLink,
  };
}

module.exports = { uploadDocument };
