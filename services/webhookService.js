const https = require('https');
const http = require('http');
const { URL } = require('url');
const crypto = require('crypto');

function deliverWebhook(webhook, event, payload) {
  return new Promise((resolve) => {
    try {
      const { getDb } = require('../config/database');
      const db = getDb();
      const body = JSON.stringify({ event, payload, timestamp: new Date().toISOString(), source: 'ProjectFlow' });
      const parsed = new URL(webhook.url);
      const headers = {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(body),
        'X-ProjectFlow-Event': event,
      };
      if (webhook.secret) {
        headers['X-ProjectFlow-Signature'] = crypto.createHmac('sha256', webhook.secret).update(body).digest('hex');
      }
      const options = {
        hostname: parsed.hostname,
        port: parsed.port || (parsed.protocol === 'https:' ? 443 : 80),
        path: parsed.pathname + (parsed.search || ''),
        method: 'POST',
        headers,
        timeout: 10000,
      };
      const proto = parsed.protocol === 'https:' ? https : http;
      const req = proto.request(options, (res) => {
        res.resume();
        res.on('end', () => {
          try { db.prepare('INSERT INTO webhook_logs (webhook_id, event, payload, response_status) VALUES (?, ?, ?, ?)').run(webhook.id, event, body, res.statusCode); } catch {}
          resolve({ status: res.statusCode });
        });
      });
      req.on('error', (err) => {
        try { db.prepare('INSERT INTO webhook_logs (webhook_id, event, payload, error) VALUES (?, ?, ?, ?)').run(webhook.id, event, body, err.message); } catch {}
        resolve({ error: err.message });
      });
      req.on('timeout', () => req.destroy());
      req.write(body);
      req.end();
    } catch (err) {
      resolve({ error: err.message });
    }
  });
}

async function fireEvent(event, payload) {
  try {
    const { getDb } = require('../config/database');
    const db = getDb();
    const webhooks = db.prepare("SELECT * FROM webhooks WHERE is_active = 1").all();
    for (const wh of webhooks) {
      try {
        const events = JSON.parse(wh.events || '[]');
        if (events.includes('*') || events.includes(event)) {
          deliverWebhook(wh, event, payload).catch(() => {});
        }
      } catch {}
    }
  } catch {}
}

module.exports = { deliverWebhook, fireEvent };
