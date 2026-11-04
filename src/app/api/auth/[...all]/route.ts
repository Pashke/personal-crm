import { getAuth } from "@/lib/auth";

// Better Auth's own endpoints: the sign-in link from the email (/api/auth/magic-link/verify)
// and the session service paths. Requesting a link here is turned off (see createAuth).
export function GET(request: Request) {
  return getAuth().handler(request);
}

export function POST(request: Request) {
  return getAuth().handler(request);
}
