// Better Auth settings in one place. The app calls createAuth() with its own database
// (src/lib/auth.ts) or with an open transaction (requestSignInLink), tests with a test database,
// the Better Auth CLI with a database without a connection (scripts/better-auth-cli.ts).
// No `server-only` here: the CLI cannot load such a file.
import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { nextCookies } from "better-auth/next-js";
import { magicLink } from "better-auth/plugins/magic-link";
import type { NodePgQueryResultHKT } from "drizzle-orm/node-postgres";
import type { PgDatabase } from "drizzle-orm/pg-core";

import * as schema from "@/db/schema";
import { sendMail } from "@/lib/mail";
import { signInEmail } from "@/lib/sign-in-email";

// A sign-in link works for 15 minutes.
export const SIGN_IN_LINK_TTL_SECONDS = 15 * 60;

const DAY_SECONDS = 24 * 60 * 60;

// A session lives 30 days. A visit renews it for 30 days from now, at most once a day,
// so after the last visit it lives 29 to 30 days.
export const SESSION_TTL_SECONDS = 30 * DAY_SECONDS;
const SESSION_RENEW_AFTER_SECONDS = DAY_SECONDS;

// A database or a transaction in it: Better Auth then reads and writes through that connection.
export type AuthDb = PgDatabase<NodePgQueryResultHKT, typeof schema>;

type AuthSettings = {
  // Next.js cookies for server actions: sign-out clears the session cookie through them.
  // The proxy turns them off (see getProxyAuth in src/lib/auth.ts).
  nextCookies?: boolean;
};

// The secret and the app address come from BETTER_AUTH_SECRET and BETTER_AUTH_URL.
// With an https address the cookies are Secure and get the "__Secure-" prefix (Better Auth's default).
export function createAuth(db: AuthDb, { nextCookies: withNextCookies = true }: AuthSettings = {}) {
  return betterAuth({
    appName: "Личная CRM",
    database: drizzleAdapter(db, { provider: "pg", usePlural: true, schema }),
    session: {
      expiresIn: SESSION_TTL_SECONDS,
      updateAge: SESSION_RENEW_AFTER_SECONDS,
      // No session cache in a cookie: with it, a signed-out session would keep working on other
      // devices for up to 5 minutes.
      cookieCache: { enabled: false },
    },
    // A sign-in link is requested only through the server action requestSignInLink, which checks the
    // address and the email limit. Open over HTTP: the link from the email (/magic-link/verify)
    // and the session service paths.
    disabledPaths: ["/sign-in/magic-link"],
    advanced: {
      // Cookies named after the app, not the library ("better-auth.session_token" by default):
      // the app does not name its software.
      cookiePrefix: "crm",
      // The visitor's address, for Better Auth's own per-IP request limits: nginx on the server
      // puts it into X-Real-IP.
      ipAddress: { ipAddressHeaders: ["x-real-ip"] },
    },
    plugins: [
      magicLink({
        expiresIn: SIGN_IN_LINK_TTL_SECONDS,
        // A failure here reaches requestSignInLink, which tells the person the email was not sent.
        sendMagicLink: async ({ email, url }) => {
          await sendMail({ to: email, ...signInEmail(url) });
        },
      }),
      // Must stay the last plugin.
      ...(withNextCookies ? [nextCookies()] : []),
    ],
    telemetry: { enabled: false },
  });
}

export type Auth = ReturnType<typeof createAuth>;
