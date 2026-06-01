const nodemailer = require('nodemailer');

const smtpEnabled = Boolean(
  process.env.SMTP_HOST &&
  process.env.SMTP_PORT &&
  process.env.SMTP_USER &&
  process.env.SMTP_PASS
);

let transporter = null;
if (smtpEnabled) {
  transporter = nodemailer.createTransport({
    host: process.env.SMTP_HOST,
    port: Number(process.env.SMTP_PORT) || 587,
    secure: process.env.SMTP_SECURE === 'true',
    auth: {
      user: process.env.SMTP_USER,
      pass: process.env.SMTP_PASS,
    },
  });
}

async function sendMail({ to, subject, text, html }) {
  if (!smtpEnabled || !transporter) {
    throw new Error('SMTP is not configured. Set SMTP_HOST, SMTP_PORT, SMTP_USER, and SMTP_PASS in .env.');
  }

  const from = process.env.EMAIL_FROM || process.env.SMTP_USER;
  return transporter.sendMail({
    from,
    to,
    subject,
    text,
    html,
  });
}

module.exports = {
  sendMail,
  smtpEnabled,
};
