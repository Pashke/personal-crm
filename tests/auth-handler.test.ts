import { describe, expect, it } from "vitest";

import { getDb } from "@/db";
import { verifications } from "@/db/schema";
import { getAuth } from "@/lib/auth";

import { TEST_APP_URL } from "./setup/helpers";
import { sentEmails } from "./setup/mail-trap";

// Better Auth's HTTP endpoints (/api/auth/...): only what the app needs is open.
describe("Better Auth endpoints", () => {
  it("a sign-in link cannot be requested over HTTP past the form: no link, no email", async () => {
    const response = await getAuth().handler(
      new Request(`${TEST_APP_URL}/api/auth/sign-in/magic-link`, {
        method: "POST",
        headers: { "content-type": "application/json", origin: TEST_APP_URL },
        body: JSON.stringify({ email: "anna@example.com", callbackURL: "/" }),
      }),
    );

    expect(response.status).toBe(404);
    expect(await getDb().select().from(verifications)).toEqual([]);
    expect(sentEmails).toEqual([]);
  });
});
