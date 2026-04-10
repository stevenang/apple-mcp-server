import nodemailer from 'nodemailer';
import { SMTP_SERVER, SMTP_PORT } from '../constants.js';
import { getSmtpAuth, getEmail } from '../auth.js';

/**
 * Send an email via iCloud SMTP (smtp.mail.me.com:587, STARTTLS).
 *
 * @param to       One or more recipient addresses
 * @param subject  Email subject line
 * @param body     Plain-text body
 * @param cc       Optional CC recipients
 * @param bcc      Optional BCC recipients
 */
export async function sendEmail(
  to: string | string[],
  subject: string,
  body: string,
  cc?: string | string[],
  bcc?: string | string[],
): Promise<void> {
  const transport = nodemailer.createTransport({
    host: SMTP_SERVER,
    port: SMTP_PORT,
    secure: false,     // plain connection upgraded via STARTTLS
    requireTLS: true,  // reject if server doesn't support STARTTLS
    auth: getSmtpAuth(),
  });

  await transport.sendMail({
    from: getEmail(),
    to,
    subject,
    text: body,
    ...(cc ? { cc } : {}),
    ...(bcc ? { bcc } : {}),
  });

  transport.close();
}
