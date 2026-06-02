const nodemailer = require('nodemailer');

const smtpEnabled = Boolean(
  process.env.RESEND_API_KEY || (
    process.env.SMTP_HOST &&
    process.env.SMTP_PORT &&
    process.env.SMTP_USER &&
    process.env.SMTP_PASS
  )
);

let transporter = null;
if (!process.env.RESEND_API_KEY && smtpEnabled) {
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
    } else {
      console.log('✓ SMTP transporter is ready to send messages');
    }
  });
}

async function sendMail({ to, subject, text, html }) {
  if (!smtpEnabled) {
    throw new Error('Mailing service is not configured. Set RESEND_API_KEY or SMTP variables in .env.');
  }

  // Use Resend HTTP API if API Key is configured (Safe for Render, bypasses SMTP blocks)
  if (process.env.RESEND_API_KEY) {
    const from = process.env.RESEND_FROM || 'onboarding@resend.dev';
    try {
      const response = await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${process.env.RESEND_API_KEY}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          from,
          to: [to],
          subject,
          text,
          html
        })
      });
      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.message || 'Resend API error');
      }
      console.log(`✓ Email sent successfully via Resend. MessageId: ${data.id}`);
      return { messageId: data.id };
    } catch (err) {
      console.error(`✗ Email send failed via Resend for ${to}:`, err.message || err);
      throw err;
    }
  }

  // Fallback to Nodemailer SMTP (Works for local development)
  if (!transporter) {
    throw new Error('SMTP transporter is not initialized.');
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
    console.log(`✓ Email sent successfully via SMTP. MessageId: ${result.messageId}`);
    return result;
  } catch (err) {
    console.error(`✗ Email send failed via SMTP for ${to}:`, err.message || err);
    throw err;
  }
}

module.exports = {
  sendMail,
  smtpEnabled,
};
