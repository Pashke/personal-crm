import { NextResponse, type NextRequest } from "next/server";

import { getProxyAuth } from "@/lib/auth";
import { describeError } from "@/lib/describe-error";

// Runs before every request to the app (see `config` below). Two jobs:
//  - renews the session on every visit, so it lives 30 days after the last one. A page itself
//    cannot do that: a server component is not allowed to set cookies;
//  - sends a browser without a session to the sign-in page.
// It is not the protection itself: every page and server action checks the user on its own
// (requireUser in src/lib/session.ts).

// Open without signing in: the sign-in pages, the health check, and Better Auth's endpoints
// (the link from the email lands there).
const OPEN_PATHS = new Set(["/login", "/login/expired", "/health"]);
const OPEN_PREFIX = "/api/auth/";

export async function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;
  if (OPEN_PATHS.has(pathname) || pathname.startsWith(OPEN_PREFIX)) {
    return NextResponse.next();
  }

  let session;
  try {
    session = await getProxyAuth().api.getSession({ headers: request.headers, returnHeaders: true });
  } catch (error) {
    // The database does not answer: the page will show its own error, and it checks the user itself.
    console.error("Proxy could not check the session", { error: describeError(error) });
    return NextResponse.next();
  }

  // A server action without a session goes on to the action: it signs nothing and sends the browser
  // to the sign-in page itself. A redirect here would resend the action to the sign-in page.
  const isServerAction = request.headers.has("next-action");
  const response =
    session.response || isServerAction ? NextResponse.next() : NextResponse.redirect(new URL("/login", request.url));

  // The renewed session cookie, or the removal of an ended one.
  for (const cookie of session.headers.getSetCookie()) {
    response.headers.append("set-cookie", cookie);
  }
  return response;
}

export const config = {
  // Every page and server action, but not the files of the build and not the icon.
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
