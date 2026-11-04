import { normalizeEmail } from "./email";

// The owner of the contacts and groups that existed before sign-in appeared: OWNER_EMAIL from .env.
// Migration 0005 (drizzle/0005_*.sql) reads it from the connection setting `crm.owner_email`,
// so the address never lands in git. Checked the same way the sign-in form checks an address.
// Returns the setting for the connection's `options` (PGOPTIONS), or undefined without an address:
// the migration itself stops if there is data to hand over.
export function ownerEmailSetting(raw: string | undefined): string | undefined {
  if (raw === undefined || raw.trim() === "") return undefined;
  const email = normalizeEmail(raw);
  if (!email) throw new Error("OWNER_EMAIL is not an email address: fix it in .env");
  return `-c crm.owner_email=${email}`;
}
