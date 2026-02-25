const clients = new Set();

function addClient(res) {
  res.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache',
    'Connection': 'keep-alive',
    'X-Accel-Buffering': 'no',
  });
  res.write('data: {"type":"connected"}\n\n');
  clients.add(res);

  // Heartbeat to keep connection alive through proxies
  const heartbeat = setInterval(() => {
    try { res.write(':ping\n\n'); } catch (_) { /* client disconnected */ }
  }, 25000);

  res.on('close', () => {
    clients.delete(res);
    clearInterval(heartbeat);
  });
}

function broadcastToSSE(event) {
  const data = `data: ${JSON.stringify(event)}\n\n`;
  clients.forEach(client => {
    try { client.write(data); } catch (_) { clients.delete(client); }
  });
}

module.exports = { addClient, broadcastToSSE };
