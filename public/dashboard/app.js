let selectedConvId = null;
let allConversations = [];
let currentFilter = 'all';
let evtSource = null;

// ── SSE ────────────────────────────────────────────────────────────────────
function connectSSE() {
  evtSource = new EventSource('/dashboard/events');

  evtSource.onopen = () => {
    document.getElementById('connectionStatus').className = 'status-dot online';
    document.getElementById('connectionLabel').textContent = 'Live';
  };

  evtSource.onerror = () => {
    document.getElementById('connectionStatus').className = 'status-dot offline';
    document.getElementById('connectionLabel').textContent = 'Reconnecting...';
    setTimeout(connectSSE, 3000);
  };

  evtSource.onmessage = (e) => {
    const event = JSON.parse(e.data);
    if (event.type === 'connected') return;

    if (event.type === 'new_message') {
      loadConversations();
      if (selectedConvId == event.conversationId) loadChat(selectedConvId);
    }
    if (event.type === 'takeover_needed') {
      loadConversations();
      showNotification(`⚠ ${event.customerName} needs an agent!`);
      if (Notification.permission === 'granted') {
        new Notification('SKM Agent Alert', { body: `Customer needs assistance: ${event.customerName}` });
      }
    }
    if (event.type === 'mode_changed') {
      loadConversations();
      if (selectedConvId == event.conversationId) loadChat(selectedConvId);
    }
  };
}

// ── Conversations list ─────────────────────────────────────────────────────
async function loadConversations() {
  const res = await fetch('/dashboard/api/conversations');
  allConversations = await res.json();
  renderConversationList();
}

function filterConversations(convs) {
  if (currentFilter === 'all') return convs;
  if (currentFilter === 'human') return convs.filter(c => c.mode === 'human');
  if (currentFilter === 'bot') return convs.filter(c => c.mode === 'bot' && c.status !== 'completed');
  if (currentFilter === 'completed') return convs.filter(c => c.status === 'completed');
  return convs;
}

function renderConversationList() {
  const filtered = filterConversations(allConversations);
  const container = document.getElementById('conversationList');

  if (filtered.length === 0) {
    container.innerHTML = '<div class="loading">No conversations yet</div>';
    return;
  }

  container.innerHTML = filtered.map(c => {
    const name = c.customer_name || formatNumber(c.whatsapp_number);
    const time = c.last_message_at ? formatTime(c.last_message_at) : '';
    const needsAgent = c.mode === 'human' && c.status === 'human_takeover';
    const serviceLabel = c.service_type ? c.service_type.replace(/_/g, ' ') : '';

    return `<div class="conv-item ${selectedConvId == c.id ? 'active' : ''} ${needsAgent ? 'needs-agent' : ''}"
                 onclick="selectConversation(${c.id})">
      <div class="conv-item-header">
        <span class="conv-name">${escHtml(name)}</span>
        <span class="conv-time">${time}</span>
      </div>
      <div class="conv-number">${formatNumber(c.whatsapp_number)}</div>
      ${c.last_message ? `<div class="conv-preview">${escHtml(c.last_message)}</div>` : ''}
      <div class="conv-badges">
        ${needsAgent ? '<span class="badge badge-alert">⚠ Needs Agent</span>' : ''}
        ${c.mode === 'bot' ? '<span class="badge badge-bot">Bot</span>' : ''}
        ${c.mode === 'human' && !needsAgent ? '<span class="badge badge-human">Human</span>' : ''}
        ${c.status === 'completed' ? '<span class="badge badge-completed">Done</span>' : ''}
        ${serviceLabel ? `<span class="badge badge-service">${serviceLabel}</span>` : ''}
        ${c.document_count > 0 ? `<span class="badge badge-bot">📄 ${c.document_count} docs</span>` : ''}
      </div>
    </div>`;
  }).join('');
}

function selectConversation(id) {
  selectedConvId = id;
  renderConversationList();
  loadChat(id);
}

// ── Chat panel ─────────────────────────────────────────────────────────────
async function loadChat(id) {
  const res = await fetch(`/dashboard/api/conversations/${id}`);
  const { conversation, messages, documents, customer } = await res.json();

  document.getElementById('noChatSelected').style.display = 'none';
  document.getElementById('chatPanel').style.display = 'flex';

  // Header
  const name = customer.name || formatNumber(customer.whatsapp_number);
  document.getElementById('chatCustomerName').textContent = name;

  const stage = conversation.stage || '';
  const service = conversation.service_type ? conversation.service_type.replace(/_/g, ' ') : 'Not selected';
  document.getElementById('chatMeta').textContent =
    `${formatNumber(customer.whatsapp_number)} · Service: ${service} · Stage: ${stage}`;

  // Mode UI
  const isHuman = conversation.mode === 'human';
  document.getElementById('modeLabel').textContent = isHuman ? 'Human Mode' : 'Bot Mode';
  document.getElementById('modeLabel').className = `mode-label ${conversation.mode}`;
  document.getElementById('takeoverBtn').style.display = isHuman ? 'none' : 'inline-block';
  document.getElementById('handbackBtn').style.display = isHuman ? 'inline-block' : 'none';
  document.getElementById('humanInputArea').style.display = isHuman ? 'flex' : 'none';
  document.getElementById('botModeNote').style.display = isHuman ? 'none' : 'block';

  // Drive folder link
  if (customer.drive_folder_url) {
    const link = document.getElementById('driveFolderLink');
    link.href = customer.drive_folder_url;
    link.style.display = 'inline-block';
  } else {
    document.getElementById('driveFolderLink').style.display = 'none';
  }

  // Messages
  const area = document.getElementById('messagesArea');
  area.innerHTML = messages.map(m => {
    const isSent = m.direction === 'outbound';
    const isHumanAgent = m.sender_type === 'human_agent';
    const cls = isHumanAgent ? 'human-agent' : (isSent ? 'outbound' : 'inbound');
    const sender = m.sender_type === 'bot' ? '🤖 Priya' : m.sender_type === 'human_agent' ? '👤 Agent' : '👨 Customer';
    const time = formatTime(m.created_at);
    const isMedia = ['image', 'document', 'audio'].includes(m.message_type);
    const content = isMedia ? `[${m.message_type}]${m.content ? ' · ' + m.content : ''}` : (m.content || '');

    return `<div class="message ${cls}">
      <div class="msg-sender">${sender}</div>
      ${escHtml(content)}
      <div class="msg-meta">${time}</div>
    </div>`;
  }).join('');

  // Scroll to bottom
  area.scrollTop = area.scrollHeight;

  // Documents
  const docsList = document.getElementById('docsList');
  if (documents.length === 0) {
    docsList.innerHTML = '<span class="no-docs">No documents received yet</span>';
  } else {
    docsList.innerHTML = documents.map(d =>
      `<a href="${d.drive_file_url || '#'}" target="_blank" class="doc-chip">
        📄 ${escHtml(d.document_type.replace(/_/g, ' '))}
      </a>`
    ).join('');
  }
}

// ── Actions ────────────────────────────────────────────────────────────────
async function takeOver() {
  if (!selectedConvId) return;
  const agentName = prompt('Enter your name for this takeover:');
  if (!agentName) return;
  await fetch(`/dashboard/api/conversations/${selectedConvId}/takeover`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ agentName }),
  });
  loadChat(selectedConvId);
  loadConversations();
}

async function handBack() {
  if (!selectedConvId) return;
  if (!confirm('Hand this conversation back to the AI bot?')) return;
  await fetch(`/dashboard/api/conversations/${selectedConvId}/handback`, { method: 'POST' });
  loadChat(selectedConvId);
  loadConversations();
}

async function sendAgentMessage() {
  if (!selectedConvId) return;
  const input = document.getElementById('messageInput');
  const text = input.value.trim();
  if (!text) return;

  input.value = '';
  input.disabled = true;

  await fetch(`/dashboard/api/conversations/${selectedConvId}/send`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ text }),
  });

  input.disabled = false;
  input.focus();
  loadChat(selectedConvId);
}

function handleInputKeydown(e) {
  if (e.key === 'Enter' && !e.shiftKey) {
    e.preventDefault();
    sendAgentMessage();
  }
}

// ── Filters ────────────────────────────────────────────────────────────────
document.querySelectorAll('.filter-tab').forEach(tab => {
  tab.addEventListener('click', () => {
    document.querySelectorAll('.filter-tab').forEach(t => t.classList.remove('active'));
    tab.classList.add('active');
    currentFilter = tab.dataset.filter;
    renderConversationList();
  });
});

// ── Notifications ──────────────────────────────────────────────────────────
function showNotification(msg) {
  const el = document.getElementById('notification');
  el.textContent = msg;
  el.style.display = 'block';
  setTimeout(() => { el.style.display = 'none'; }, 5000);
}

// ── Helpers ────────────────────────────────────────────────────────────────
function escHtml(str) {
  if (!str) return '';
  return String(str).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function formatNumber(num) {
  if (!num) return '';
  const s = String(num);
  if (s.startsWith('91') && s.length === 12) return '+91 ' + s.slice(2, 7) + ' ' + s.slice(7);
  return '+' + s;
}

function formatTime(ts) {
  if (!ts) return '';
  const d = new Date(ts);
  const now = new Date();
  const isToday = d.toDateString() === now.toDateString();
  if (isToday) return d.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' });
  return d.toLocaleDateString('en-IN', { day: 'numeric', month: 'short' }) + ' ' +
         d.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' });
}

// ── Init ───────────────────────────────────────────────────────────────────
if (Notification.permission !== 'granted') Notification.requestPermission();

connectSSE();
loadConversations();
setInterval(loadConversations, 30000); // Refresh every 30s as fallback
