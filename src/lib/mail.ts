// Sending emails. Where they go is decided by SMTP_URL alone, so one build works everywhere:
// on a computer and in tests it is the mail stub (smtp://127.0.0.1:1025, Mailpit),
// on the server Resend (smtps://resend:<key>@smtp.resend.com:465).
// No `server-only` here: the Better Auth CLI loads this file through createAuth().
import nodemailer, { type Transporter } from "nodemailer";

export type MailMessage = {
  from: string;
  to: string;
  subject: string;
  html: string;
  text: string;
};

// Created on the first email rather than on import: `next build` runs without SMTP_URL.
let transport: Transporter | undefined;

export async function sendMail(message: MailMessage) {
  transport ??= nodemailer.createTransport({
    url: requireSmtpUrl(),
    // A sign-in request waits for the email, so a mail server that does not answer
    // ends the attempt in seconds rather than the default minutes.
    connectionTimeout: 10_000,
    greetingTimeout: 10_000,
    socketTimeout: 20_000,
  });
  await transport.sendMail(message);
}

function requireSmtpUrl() {
  const url = process.env.SMTP_URL;
  if (!url) throw new Error("SMTP_URL is not set: add it to .env (see README)");
  return url;
}
