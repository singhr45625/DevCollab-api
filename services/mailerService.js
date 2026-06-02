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
    service: process.env.SMTP_SERVICE || undefined,
    host: process.env.SMTP_HOST,
    port: Number(process.env.SMTP_PORT) || 587,
    secure: process.env.SMTP_SECURE === 'true',
    auth: {
      user: process.env.SMTP_USER,
      pass: process.env.SMTP_PASS,
    },
    connectionTimeout: 8000, // 8 seconds timeout
    greetingTimeout: 8000,
    socketTimeout: 8000,
    tls: {
      rejectUnauthorized: false,
    },
  });

  transporter.verify((error, success) => {
    if (error) {
      console.error('SMTP transporter verification failed:', error.message || error);
      console.error('SMTP Config:', {
        host: process.env.SMTP_HOST,
        port: process.env.SMTP_PORT,
        secure: process.env.SMTP_SECURE,
        user: process.env.SMTP_USER
      });
    } else {
      console.log('✓ SMTP transporter is ready to send messages');
    }
  });
}

async function sendMail({ to, subject, text, html }) {
  if (!smtpEnabled || !transporter) {
    throw new Error('SMTP is not configured. Set SMTP_HOST, SMTP_PORT, SMTP_USER, and SMTP_PASS in .env.');
  }

  const from = process.env.EMAIL_FROM || process.env.SMTP_USER;
  try {
    const result = await transporter.sendMail({
      from,
      to,
      subject,
      text,
      html,
    });
    console.log(`✓ Email sent successfully. MessageId: ${result.messageId}`);
    return result;
  } catch (err) {
    console.error(`✗ Email send failed for ${to}:`, err.message || err);
    console.error('Error details:', {
      code: err.code,
      responseCode: err.responseCode,
      command: err.command
    });
    throw err;
  }
}

module.exports = {
  sendMail,
  smtpEnabled,
};
