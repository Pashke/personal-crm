import type { MailMessage } from "@/lib/mail";

// Stands in for src/lib/mail.ts in tests (see each-file.ts): emails are kept here instead of being
// sent. mail.test.ts checks the real sending through the mail stub.

export const sentEmails: MailMessage[] = [];

let failure: Error | null = null;

export async function sendMail(message: MailMessage) {
  if (failure) throw failure;
  sentEmails.push(message);
}

// From now on every email fails, as when the mail service does not answer.
export function failEmails(error = new Error("Connection timeout")) {
  failure = error;
}

export function resetMailTrap() {
  sentEmails.length = 0;
  failure = null;
}

// Emails to one address, the newest last.
export function emailsTo(address: string) {
  return sentEmails.filter((email) => email.to === address);
}
