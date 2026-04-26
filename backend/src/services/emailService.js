import nodemailer from 'nodemailer';

export const isEmailConfigured = () =>
  !!(process.env.SENDGRID_API_KEY || process.env.SMTP_HOST);

const createTransporter = () => {
  if (process.env.SENDGRID_API_KEY) {
    return nodemailer.createTransport({
      host: 'smtp.sendgrid.net',
      port: 587,
      auth: { user: 'apikey', pass: process.env.SENDGRID_API_KEY },
    });
  }

  if (process.env.SMTP_HOST) {
    return nodemailer.createTransport({
      host: process.env.SMTP_HOST,
      port: Number(process.env.SMTP_PORT || 587),
      secure: process.env.SMTP_SECURE === 'true',
      auth: process.env.SMTP_USER
        ? { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS || '' }
        : undefined,
    });
  }

  return null;
};

export const sendBuildCompleteNotification = async ({ to, repoOwner, repoName, success }) => {
  if (!to || !isEmailConfigured()) return;

  const transporter = createTransporter();
  if (!transporter) return;

  const from = process.env.SMTP_FROM || process.env.EMAIL_FROM || 'noreply@proofdesk.app';
  const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:3000';
  const repoLabel = `${repoOwner}/${repoName}`;

  const subject = success
    ? `Build complete: ${repoLabel}`
    : `Build failed: ${repoLabel}`;

  const textBody = success
    ? `Your PreTeXt build for ${repoLabel} completed successfully.\n\nOpen your workspace: ${frontendUrl}/editor`
    : `Your PreTeXt build for ${repoLabel} did not succeed. Open the workspace to review the build log.\n\n${frontendUrl}/editor`;

  const htmlBody = success
    ? `<p>Your PreTeXt build for <strong>${repoLabel}</strong> completed successfully.</p>
       <p><a href="${frontendUrl}/editor">Open your workspace</a></p>`
    : `<p>Your PreTeXt build for <strong>${repoLabel}</strong> did not succeed.</p>
       <p><a href="${frontendUrl}/editor">Review the build log</a></p>`;

  try {
    await transporter.sendMail({ from, to, subject, text: textBody, html: htmlBody });
    console.log(`[Email] Build notification sent to ${to} for ${repoLabel}`);
  } catch (err) {
    console.warn(`[Email] Failed to send build notification to ${to}:`, err.message);
  }
};
