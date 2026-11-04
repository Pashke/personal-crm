import { z } from "zod";

// The longest email address mail servers accept.
const MAX_EMAIL_LENGTH = 254;

const emailSchema = z.email().max(MAX_EMAIL_LENGTH);

// One email address is one user: spaces at the edges are dropped and letter case does not matter.
// Returns the address the way the server keeps it, or null when the value is not an email.
// Lives in src/db/ because migrations (drizzle.config.ts) and the demo data use it too,
// and the production image has src/db/ but not src/lib/.
export function normalizeEmail(raw: unknown): string | null {
  if (typeof raw !== "string") return null;
  const parsed = emailSchema.safeParse(raw.trim().toLowerCase());
  return parsed.success ? parsed.data : null;
}
