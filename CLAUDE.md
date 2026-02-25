# CLAUDE.md — SKM WhatsApp Agent

## Project Overview
WhatsApp AI sales agent for SKM Financial Services. Handles loan applications (personal, home, auto, education) and credit score repair. Uses GPT-4o for conversations, Google Drive for document storage, and provides a human dashboard for agent takeover.

## Stack
- **Runtime**: Node.js + Express.js
- **Database**: better-sqlite3 (synchronous — NO async/await for DB calls, all queries are sync)
- **AI**: OpenAI SDK v4 (gpt-4o for conversation, gpt-4o-mini for data extraction)
- **WhatsApp**: Meta Cloud API (webhook-based, REST via axios)
- **Storage**: Google Drive API v3 via service account
- **Dashboard**: Vanilla JS + SSE (no React, no framework)

## Critical Architecture Rules
1. **All DB queries in `src/db/queries.js` only.** Never write SQL in other files.
2. **`broadcastToSSE()` only from `src/dashboard/sseManager.js`.** Import this wherever you need to push to dashboard.
3. **NEVER block the POST /webhook handler.** Always `res.sendStatus(200)` first, then process async.
4. **Trim gpt_messages to last 30 entries** before every OpenAI call to manage context/cost.
5. **Google private key**: always `.replace(/\\n/g, '\n')` before using — env files escape newlines.
6. **Extraction calls → `gpt-4o-mini`**; Conversation calls → `gpt-4o`.
7. **One question at a time** — the system prompt enforces this, don't break it.

## Key File Locations
- Entry point: `server.js`
- DB schema: `src/db/migrations.js`
- DB queries: `src/db/queries.js`
- Webhook orchestration: `src/whatsapp/webhook.js`
- AI agent core: `src/ai/agent.js`
- Conversation stage machine: `src/ai/stateManager.js`
- System prompt builder: `src/ai/systemPrompt.js`
- Google Drive auth: `src/drive/auth.js`
- Dashboard API routes: `src/dashboard/router.js`
- SSE broadcaster: `src/dashboard/sseManager.js`
- Dashboard frontend: `public/dashboard/app.js`

## Conversation Stage Flow
greeting → personal_info → service_specific_info → document_request → document_collection → summary_confirmation → completed

## Human-in-the-Loop
- Bot detects `[HANDOFF_REQUESTED]` in its own reply → sets `mode='human'`
- Dashboard agents can also click "Take Over" button
- While `mode='human'`: inbound messages go to SSE only (no bot reply)
- Agents send replies via `POST /dashboard/api/conversations/:id/send`
- Human messages are added to `gpt_messages` so bot has context when it resumes
- "Hand Back" button → sets `mode='bot'`, bot resumes with full history

## Dev Setup
```bash
npm install
cp .env.example .env
# Fill in .env with real credentials
npm run dev
# In another terminal:
ngrok http 3000
# Register the ngrok URL in Meta Developer Console as webhook URL
# Verify token must match WHATSAPP_WEBHOOK_VERIFY_TOKEN in .env
```

## Testing Webhook Locally
```bash
curl -X POST http://localhost:3000/webhook \
  -H "Content-Type: application/json" \
  -d '{"object":"whatsapp_business_account","entry":[{"changes":[{"field":"messages","value":{"messages":[{"id":"test123","from":"919876543210","type":"text","text":{"body":"hello"}}]}}]}]}'
```

## Environment Variables Required
See `.env.example` for full list. Key ones:
- `WHATSAPP_PHONE_NUMBER_ID`, `WHATSAPP_ACCESS_TOKEN`, `WHATSAPP_WEBHOOK_VERIFY_TOKEN`
- `OPENAI_API_KEY`, `OPENAI_MODEL` (default: gpt-4o)
- `GOOGLE_SERVICE_ACCOUNT_EMAIL`, `GOOGLE_PRIVATE_KEY`, `GOOGLE_DRIVE_ROOT_FOLDER_ID`
- `DASHBOARD_PASSWORD`, `SESSION_SECRET`

## Google Drive Setup
1. Create a Google Cloud project
2. Enable Google Drive API
3. Create a Service Account, download JSON key
4. Extract `client_email` and `private_key` into .env
5. Create a root folder in Google Drive
6. Share that folder with the service account email (Editor role)
7. Copy the folder ID from the URL into `GOOGLE_DRIVE_ROOT_FOLDER_ID`

## Production Deploy
- Deploy to Railway, Render, or DigitalOcean App Platform
- Set all env vars in the platform dashboard
- The public URL replaces ngrok for the Meta webhook registration
- Set `NODE_ENV=production` for secure cookies
