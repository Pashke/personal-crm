import { describe, expect, it } from "vitest";

import { signOut } from "@/app/(auth)/login/actions";
import { getDb } from "@/db";
import { sessions } from "@/db/schema";
import { getAuth } from "@/lib/auth";

import { signInThroughEmail } from "./setup/auth";
import { redirectTarget } from "./setup/helpers";
import { setRequestHeaders } from "./setup/request";

// openspec user-auth: «Несколько устройств» and «Выход только на этом устройстве».
// A device is a browser with its own session cookie.

async function userOf(cookie: string) {
  const session = await getAuth().api.getSession({ headers: new Headers({ cookie }) });
  return session?.user.email ?? null;
}

describe("devices", () => {
  it("Два устройства: signing in on the phone keeps the computer signed in", async () => {
    const computer = await signInThroughEmail("anna@example.com");
    const phone = await signInThroughEmail("anna@example.com");

    expect(phone).not.toBe(computer);
    expect(await userOf(computer)).toBe("anna@example.com");
    expect(await userOf(phone)).toBe("anna@example.com");
  });
});

describe("«Выйти»", () => {
  it("Выход: ends the session of this device and opens the sign-in page", async () => {
    const cookie = await signInThroughEmail("anna@example.com");
    setRequestHeaders({ cookie });

    expect(await redirectTarget(() => signOut())).toBe("/login");

    expect(await getDb().select().from(sessions)).toEqual([]);
    expect(await userOf(cookie)).toBeNull();
  });

  it("Другое устройство остаётся: signing out on the phone keeps the computer signed in", async () => {
    const computer = await signInThroughEmail("anna@example.com");
    const phone = await signInThroughEmail("anna@example.com");
    setRequestHeaders({ cookie: phone });

    await redirectTarget(() => signOut());

    expect(await userOf(phone)).toBeNull();
    expect(await userOf(computer)).toBe("anna@example.com");
  });

  it("without a session it just opens the sign-in page", async () => {
    expect(await redirectTarget(() => signOut())).toBe("/login");
  });
});
