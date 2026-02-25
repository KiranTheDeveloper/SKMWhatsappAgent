# Setup Guide — SKM WhatsApp Agent

This file tracks what credentials still need to be filled in and how to get each one.

## Current Status

| Credential | Status |
|---|---|
| OpenAI API Key | ✅ Done |
| WhatsApp Access Token | ✅ Done |
| WhatsApp Phone Number ID | ⏳ Pending |
| WhatsApp Webhook Verify Token | ⏳ Pending |
| Google Service Account Email | ⏳ Pending |
| Google Private Key | ⏳ Pending |
| Google Drive Root Folder ID | ⏳ Pending |
| Dashboard Password | ⏳ Set to default (change it) |

---

## What You Need Right Now (Step by Step)

### 1. WhatsApp Phone Number ID

1. Go to [developers.facebook.com](https://developers.facebook.com) → My Apps → your app
2. Left menu → **WhatsApp → Getting Started**
3. Copy the **Phone Number ID** (a long number, e.g. `123456789012345`)
4. Paste it into `.env` as `WHATSAPP_PHONE_NUMBER_ID=`

### 2. WhatsApp Webhook Verify Token

This is a string **you make up** — it can be anything (e.g. `skm-verify-2024`).
- Set it in `.env` as `WHATSAPP_WEBHOOK_VERIFY_TOKEN=skm-verify-2024`
- You will enter this same string in Meta Developer Console when registering the webhook

### 3. Add Your Phone as Test Recipient

On the Meta Developer Console → WhatsApp → Getting Started:
- Under **"To"**, click **"Manage phone number list"**
- Add your personal WhatsApp number
- This allows the test bot number to message you

### 4. Google Drive — Service Account

#### Create Google Cloud Project
1. Go to [console.cloud.google.com](https://console.cloud.google.com)
2. New Project → name it `skm-whatsapp-agent`
3. Left menu → **APIs & Services → Library**
4. Search **"Google Drive API"** → Enable it

#### Create Service Account
1. Left menu → **APIs & Services → Credentials**
2. **+ Create Credentials → Service Account**
3. Name it `skm-agent` → Create and Continue → Done
4. Click the service account → **Keys tab → Add Key → Create new key → JSON**
5. A `.json` file downloads — open it and copy:
   - `client_email` → paste as `GOOGLE_SERVICE_ACCOUNT_EMAIL=`
   - `private_key` → paste as `GOOGLE_PRIVATE_KEY=` (keep in double quotes, keep the `\n` characters)

#### Create Root Drive Folder
1. Go to [drive.google.com](https://drive.google.com)
2. Create a folder called **"SKM Customers"**
3. Right-click → **Share** → paste the `client_email` → set role to **Editor** → Share
4. Open the folder → copy the ID from the URL:
   ```
   https://drive.google.com/drive/folders/THIS_PART_IS_THE_ID
   ```
5. Paste as `GOOGLE_DRIVE_ROOT_FOLDER_ID=`

---

## Running the App

### Step 1 — Install ngrok
Download from [ngrok.com](https://ngrok.com), sign up for free, then:
```bash
ngrok config add-authtoken YOUR_NGROK_AUTHTOKEN
```

### Step 2 — Start the app
```bash
npm run dev
```

### Step 3 — Start ngrok (separate terminal)
```bash
ngrok http 3000
```
Copy the `https://xxxx.ngrok-free.app` URL.

### Step 4 — Register Webhook in Meta Console
1. Meta Developer Console → your app → **WhatsApp → Configuration**
2. Under **Webhook** → click **Edit**
3. **Callback URL**: `https://xxxx.ngrok-free.app/webhook`
4. **Verify token**: your `WHATSAPP_WEBHOOK_VERIFY_TOKEN` value
5. Click **Verify and Save**
6. Under **Webhook fields** → enable **`messages`** → Save

### Step 5 — Test
Send a WhatsApp message to the Meta test number.
The bot ("Priya") should reply within seconds.

Open the dashboard at: `http://localhost:3000/dashboard`
Login with your `DASHBOARD_PASSWORD`.

---

## Going to Production

When testing is complete and you want real customers to use the bot:

1. Register a real phone number in Meta Developer Console (not the test number)
2. Generate a **permanent access token** via Business Settings → System Users
3. Deploy to [Railway](https://railway.app) or [Render](https://render.com):
   - Connect this GitHub repo
   - Add all `.env` variables in the platform dashboard
   - Railway/Render gives a permanent `https://` URL
4. Update the webhook URL in Meta Console to your production URL
5. Set `NODE_ENV=production`

---

## .env Template

```bash
PORT=3000
NODE_ENV=development
WHATSAPP_PHONE_NUMBER_ID=            ← from Meta Developer Console
WHATSAPP_ACCESS_TOKEN=               ← already set
WHATSAPP_WEBHOOK_VERIFY_TOKEN=       ← make up a string
WHATSAPP_API_VERSION=v19.0
OPENAI_API_KEY=                      ← already set
OPENAI_MODEL=gpt-4o
GOOGLE_SERVICE_ACCOUNT_EMAIL=        ← from service account JSON
GOOGLE_PRIVATE_KEY=                  ← from service account JSON (in double quotes)
GOOGLE_DRIVE_ROOT_FOLDER_ID=         ← from Drive folder URL
DASHBOARD_PASSWORD=                  ← choose a strong password
SESSION_SECRET=                      ← any long random string
DB_PATH=./data/skm.db
```
