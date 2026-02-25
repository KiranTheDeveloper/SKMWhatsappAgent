const { getDriveClient } = require('./auth');

async function createCustomerFolder(customer, customerName) {
  const drive = getDriveClient();
  const safeName = (customerName || customer.whatsapp_number).replace(/[^a-zA-Z0-9 _-]/g, '');
  const folderName = `SKM_${safeName}_${customer.whatsapp_number}`;

  const folder = await drive.files.create({
    requestBody: {
      name: folderName,
      mimeType: 'application/vnd.google-apps.folder',
      parents: [process.env.GOOGLE_DRIVE_ROOT_FOLDER_ID],
    },
    fields: 'id, webViewLink',
  });

  // Make folder readable by anyone with the link (so agents can open it from dashboard)
  await drive.permissions.create({
    fileId: folder.data.id,
    requestBody: { type: 'anyone', role: 'reader' },
  });

  return {
    id: folder.data.id,
    url: folder.data.webViewLink,
  };
}

module.exports = { createCustomerFolder };
