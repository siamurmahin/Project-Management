const { createTransporter } = require('../config/email');
require('dotenv').config();

function getSmtpSettings() {
  try {
    const { getDb } = require('../config/database');
    const db = getDb();
    const rows = db.prepare('SELECT key, value FROM app_settings').all();
    const s = {};
    rows.forEach(r => { s[r.key] = r.value; });
    return s;
  } catch { return {}; }
}

function getAppConfig() {
  const s = getSmtpSettings();
  return {
    name: s.app_name || process.env.APP_NAME || 'ProjectFlow',
    url: s.app_url || process.env.APP_URL || 'http://localhost:3000',
    from: s.smtp_from_email
      ? `${s.smtp_from_name || s.app_name || 'ProjectFlow'} <${s.smtp_from_email}>`
      : (process.env.EMAIL_FROM || 'ProjectFlow <noreply@projectflow.com>'),
  };
}

function logEmail(to, subject, status, error) {
  try {
    const { getDb } = require('../config/database');
    const db = getDb();
    db.prepare('INSERT INTO email_logs (to_email, subject, status, error) VALUES (?, ?, ?, ?)').run(to, subject, status, error || null);
  } catch {}
}

async function sendEmail(to, subject, html) {
  const s = getSmtpSettings();
  const hasSmtp = s.smtp_user || process.env.SMTP_USER;
  if (!hasSmtp) {
    console.log(`[Email Skipped – No SMTP] To: ${to} | ${subject}`);
    return;
  }
  const app = getAppConfig();
  try {
    const t = createTransporter(s);
    await t.sendMail({ from: app.from, to, subject, html });
    console.log(`[Email Sent] To: ${to} | ${subject}`);
    try { logEmail(to, subject, 'sent', null); } catch {}
  } catch (err) {
    console.error('[Email Error]', err.message);
    try { logEmail(to, subject, 'failed', err.message); } catch {}
  }
}

async function sendEmailOrThrow(to, subject, html) {
  const s = getSmtpSettings();
  const hasSmtp = s.smtp_user || process.env.SMTP_USER;
  if (!hasSmtp) throw new Error('SMTP not configured — add credentials in Settings first');
  const app = getAppConfig();
  const t = createTransporter(s);
  try {
    await t.sendMail({ from: app.from, to, subject, html });
    console.log(`[Email Sent] To: ${to} | ${subject}`);
    try { logEmail(to, subject, 'sent', null); } catch {}
  } catch (err) {
    try { logEmail(to, subject, 'failed', err.message); } catch {}
    throw err;
  }
}

function emailTemplate(title, body) {
  const app = getAppConfig();
  return `<!DOCTYPE html><html><head><meta charset="utf-8">
<style>
  body{font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;background:#0D0D1A;margin:0;padding:20px;}
  .c{max-width:600px;margin:0 auto;background:#1A1A2E;border-radius:12px;overflow:hidden;}
  .h{background:linear-gradient(135deg,#6C5CE7,#a29bfe);padding:32px;text-align:center;}
  .h h1{color:#fff;margin:0;font-size:24px;}
  .h p{color:rgba(255,255,255,.8);margin:8px 0 0;}
  .b{padding:32px;color:#E0E0F0;}
  .b h2{color:#fff;margin-top:0;}
  .b p{line-height:1.6;color:#AAAACC;}
  .btn{display:inline-block;padding:12px 28px;background:linear-gradient(135deg,#6C5CE7,#a29bfe);color:#fff;text-decoration:none;border-radius:8px;font-weight:600;margin:16px 0;}
  .f{padding:20px 32px;border-top:1px solid rgba(255,255,255,.08);color:#666;font-size:13px;text-align:center;}
</style></head>
<body><div class="c">
  <div class="h"><h1>⚡ ${app.name}</h1><p>${title}</p></div>
  <div class="b">${body}</div>
  <div class="f">© ${new Date().getFullYear()} ${app.name} · <a href="${app.url}" style="color:#6C5CE7;">Open App</a></div>
</div></body></html>`;
}

async function sendTaskAssigned(toEmail, toName, taskTitle, boardName, assignerName) {
  const app = getAppConfig();
  const subject = `${app.name}: You've been assigned — "${taskTitle}"`;
  const body = `<h2>Task Assigned</h2><p>Hi ${toName},</p>
    <p><strong>${assignerName}</strong> assigned you to a task on <strong>${boardName}</strong>:</p>
    <div style="background:#242440;border-radius:8px;padding:16px;margin:16px 0;border-left:4px solid #6C5CE7;">
      <strong style="color:#fff;font-size:16px;">${taskTitle}</strong></div>
    <a href="${app.url}" class="btn">Open Board →</a>`;
  await sendEmail(toEmail, subject, emailTemplate('New Task Assignment', body));
}

async function sendStatusChanged(toEmail, toName, taskTitle, oldStatus, newStatus, changedByName) {
  const app = getAppConfig();
  const subject = `${app.name}: Status updated — "${taskTitle}"`;
  const colors = { todo:'#888',in_progress:'#6C5CE7',review:'#FDCB6E',done:'#00B894',blocked:'#FF5C7A' };
  const color = colors[newStatus] || '#6C5CE7';
  const body = `<h2>Status Updated</h2><p>Hi ${toName},</p>
    <p><strong>${changedByName}</strong> changed <strong>"${taskTitle}"</strong>:</p>
    <div style="display:flex;align-items:center;gap:12px;margin:16px 0;">
      <span style="background:#333;padding:6px 14px;border-radius:20px;font-size:13px;">${oldStatus.replace('_',' ')}</span>
      <span style="color:#aaa;">→</span>
      <span style="background:${color};padding:6px 14px;border-radius:20px;font-size:13px;color:#fff;font-weight:600;">${newStatus.replace('_',' ')}</span>
    </div>
    <a href="${app.url}" class="btn">View Task →</a>`;
  await sendEmail(toEmail, subject, emailTemplate('Status Update', body));
}

async function sendWelcomeEmail(toEmail, toName, tempPassword) {
  const app = getAppConfig();
  const subject = `Welcome to ${app.name}!`;
  const body = `<h2>Welcome aboard, ${toName}! 🎉</h2>
    <p>Your account has been created:</p>
    <div style="background:#242440;border-radius:8px;padding:16px;margin:16px 0;">
      <p style="margin:4px 0;"><strong>Email:</strong> <span style="color:#a29bfe;">${toEmail}</span></p>
      <p style="margin:4px 0;"><strong>Password:</strong> <span style="color:#a29bfe;">${tempPassword}</span></p>
    </div>
    <a href="${app.url}" class="btn">Login →</a>
    <p style="color:#888;font-size:13px;">Please change your password after first login.</p>`;
  await sendEmail(toEmail, subject, emailTemplate('Account Created', body));
}

async function sendLoginOtp(toEmail, toName, code) {
  const app = getAppConfig();
  const subject = `${app.name}: Your login code`;
  const body = `<h2>Login Verification Code</h2>
    <p>Hi ${toName},</p>
    <p>Use the code below to complete your sign-in. It expires in <strong>10 minutes</strong>.</p>
    <div style="background:#242440;border-radius:12px;padding:24px;margin:20px 0;text-align:center;">
      <div style="font-size:2.5rem;font-weight:800;letter-spacing:.4em;color:#a29bfe;font-family:monospace;">${code}</div>
    </div>
    <p style="color:#888;font-size:13px;">If you didn't request this, ignore this email — your account is safe.</p>`;
  await sendEmail(toEmail, subject, emailTemplate('Login Code', body));
}

async function sendBroadcastNotification(toEmail, toName, title, message) {
  const app = getAppConfig();
  const body = `<h2>${escEmailHtml(title)}</h2>
    <p>Hi ${escEmailHtml(toName)},</p>
    <p>${escEmailHtml(message)}</p>
    <a href="${app.url}" class="btn">Open App →</a>`;
  await sendEmail(toEmail, `${app.name}: ${title}`, emailTemplate(title, body));
}

function escEmailHtml(str) {
  return String(str).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
}

module.exports = { sendEmail, sendEmailOrThrow, emailTemplate, sendTaskAssigned, sendStatusChanged, sendWelcomeEmail, sendLoginOtp, sendBroadcastNotification };
