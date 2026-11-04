import "server-only";

import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { cache } from "react";

import { getAuth } from "@/lib/auth";

export type CurrentUser = { id: string; email: string };

// Who sent this request: the user of its session cookie, or null. Only the server decides this:
// every page and every server action asks here and passes user.id on to the data functions.
// Asked once per request (cache): the layout, the page and its metadata share the answer.
export const getCurrentUser = cache(async (): Promise<CurrentUser | null> => {
  const session = await getAuth().api.getSession({ headers: await headers() });
  return session ? { id: session.user.id, email: session.user.email } : null;
});

// The same, but without a signed-in user the request ends on the sign-in page.
export async function requireUser(): Promise<CurrentUser> {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  return user;
}
