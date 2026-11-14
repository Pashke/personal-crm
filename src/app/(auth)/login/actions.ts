"use server";

import { and, count, eq, lt, sql } from "drizzle-orm";
import { headers } from "next/headers";
import { redirect } from "next/navigation";

import { getDb } from "@/db";
import { normalizeEmail } from "@/db/email";
import { signInEmails, verifications } from "@/db/schema";
import { getAuth } from "@/lib/auth";
import { createAuth } from "@/lib/create-auth";
import { describeError } from "@/lib/describe-error";
import type { SignInFormState } from "@/lib/sign-in-form";

// No more than 3 emails to one address in 10 minutes. Only emails that went out count.
const EMAILS_PER_WINDOW = 3;
const LIMIT_WINDOW = "10 minutes";

// «Получить ссылку» on the sign-in page. The only way to get a sign-in link: Better Auth's own
// HTTP endpoint for it is turned off (see createAuth).
export async function requestSignInLink(_prevState: SignInFormState, formData: FormData): Promise<SignInFormState> {
  const typed = formData.get("email");
  const value = typeof typed === "string" ? typed : "";
  const email = normalizeEmail(typed);
  if (!email) {
    return { email: value, fieldError: "Проверь адрес почты" };
  }

  const requestHeaders = await headers();
  let outcome: "sent" | "too-often";
  try {
    // One transaction: if the email fails, nothing below is kept. The previous links stay valid,
    // the new link is not stored and the attempt does not count towards the limit.
    // Everything here, Better Auth included, goes through this transaction's one connection: a request
    // waiting for its turn holds a connection, so needing a second one froze the app once the
    // waiting requests took the whole pool.
    outcome = await getDb().transaction(async (tx) => {
      // Requests for one address go one at a time, so two at once cannot both pass the limit.
      await tx.execute(sql`select pg_advisory_xact_lock(hashtextextended(${email}, 0))`);

      // The limit: emails that went out to this address in the last 10 minutes.
      await tx.delete(signInEmails).where(lt(signInEmails.sentAt, sql`now() - ${LIMIT_WINDOW}::interval`));
      const [{ sent }] = await tx.select({ sent: count() }).from(signInEmails).where(eq(signInEmails.email, email));
      if (sent >= EMAILS_PER_WINDOW) return "too-often";

      // A new link cancels the previous ones of this address.
      await tx.delete(verifications).where(isSignInLinkFor(email));

      // Better Auth stores the link in this transaction, then waits for the email (sendMagicLink in
      // createAuth). A failed email throws here and rolls the transaction back.
      await createAuth(tx).api.signInMagicLink({
        body: { email, callbackURL: "/", errorCallbackURL: "/login/expired" },
        headers: requestHeaders,
      });

      await tx.insert(signInEmails).values({ email });
      return "sent";
    });
  } catch (error) {
    // No address in the log: only technical fields.
    console.error("Failed to send a sign-in email", { error: describeError(error) });
    return { email: value, formError: "Не удалось отправить письмо. Попробуй ещё раз." };
  }

  if (outcome === "too-often") {
    return { email: value, formError: "Слишком часто, попробуй через несколько минут" };
  }
  return { email: value, sentTo: email };
}

// «Выйти» in the header: ends the session of this device only, other devices stay signed in.
export async function signOut() {
  await getAuth().api.signOut({ headers: await headers() });
  redirect("/login");
}

// Sign-in links of one address. Better Auth keeps the token in `identifier` (possibly hashed) and
// {"type":"magic-link","email":...} in `value`; the email there is exactly the one passed to it,
// which is already normalized. Values that are not JSON (other kinds of verification) never match.
function isSignInLinkFor(email: string) {
  const record = sql`(case when ${verifications.value} is json object then ${verifications.value}::jsonb end)`;
  return and(sql`${record} ->> 'type' = 'magic-link'`, sql`${record} ->> 'email' = ${email}`);
}
