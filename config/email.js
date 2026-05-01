const nodemailer = require('nodemailer');

function createTransporter(settings = {}) {
  const host = settings.smtp_host || process.env.SMTP_HOST || 'smtp.gmail.com';
  const port = parseInt(settings.smtp_port || process.env.SMTP_PORT) || 587;
  // secure=true = implicit SSL (wraps entire connection in TLS, port 465 classic)
  // secure=false = STARTTLS (plain connection upgraded to TLS, port 587)
  const secure = (settings.smtp_secure || process.env.SMTP_SECURE) === 'true';

  return nodemailer.createTransport({
    host,
    port,
    secure,
    requireTLS: !secure, // force STARTTLS upgrade when not using implicit SSL
    auth: (settings.smtp_user || process.env.SMTP_USER) ? {
      user: settings.smtp_user || process.env.SMTP_USER,
      pass: settings.smtp_pass || process.env.SMTP_PASS || '',
    } : undefined,
    tls: {
      rejectUnauthorized: false,
      minVersion: 'TLSv1',
    },
    connectionTimeout: 15000,
    greetingTimeout: 15000,
    socketTimeout: 20000,
  });
}

module.exports = { createTransporter };
