import { eq } from "drizzle-orm";
import { describe, expect, it } from "vitest";

import { getDb } from "@/db";
import { sessions, users } from "@/db/schema";

import { ageSignInLinks, openLink, requestLink } from "./setup/auth";
import { sentEmails } from "./setup/mail-trap";
import { signInLinkOf } from "./setup/mailpit";

// openspec user-auth: what the link from the email does. The links are opened through Better Auth's
// real HTTP handler, on the test database.

const signedIn = (path = "/") => ({ path, sessionCookie: expect.stringMatching(/^crm\.session_token=.+/) });
const expired = { path: "/login/expired", sessionCookie: null };

async function userWith(email: string) {
  return getDb().select().from(users).where(eq(users.email, email));
}

describe("the sign-in link", () => {
  it("Первый вход: creates the user with this address, no questions, and signs the browser in", async () => {
    const result = await openLink(await requestLink("anna@example.com"));

    expect(result).toEqual(signedIn());
    const [anna] = await userWith("anna@example.com");
    expect(anna).toMatchObject({ email: "anna@example.com", name: "" });
    expect(await getDb().select().from(sessions).where(eq(sessions.userId, anna.id))).toHaveLength(1);
  });

  it("Повторный вход: the same address signs in as the same user", async () => {
    await openLink(await requestLink("anna@example.com"));
    const [first] = await userWith("anna@example.com");

    expect(await openLink(await requestLink("anna@example.com"))).toEqual(signedIn());

    expect(await userWith("anna@example.com")).toEqual([first]);
    expect(await getDb().select().from(sessions)).toHaveLength(2);
  });

  it("Повторное открытие: a used link leads to «Ссылка устарела», no second sign-in", async () => {
    const link = await requestLink("anna@example.com");
    await openLink(link);

    expect(await openLink(link)).toEqual(expired);
    expect(await getDb().select().from(sessions)).toHaveLength(1);
  });

  it("В срок: 14 minutes after sending the link still signs in", async () => {
    const link = await requestLink("anna@example.com");
    await ageSignInLinks(14);

    expect(await openLink(link)).toEqual(signedIn());
  });

  it("После срока: 16 minutes after sending the link leads to «Ссылка устарела»", async () => {
    const link = await requestLink("anna@example.com");
    await ageSignInLinks(16);

    expect(await openLink(link)).toEqual(expired);
    expect(await userWith("anna@example.com")).toEqual([]);
  });

  it("Испорченная ссылка: a changed or cut token leads to «Ссылка устарела»", async () => {
    const link = await requestLink("anna@example.com");
    const token = new URL(link).searchParams.get("token")!;
    const withToken = (value: string) => {
      const url = new URL(link);
      url.searchParams.set("token", value);
      return url.toString();
    };

    expect(await openLink(withToken(`${token.slice(0, -1)}x`))).toEqual(expired);
    expect(await openLink(withToken(token.slice(0, 10)))).toEqual(expired);
    expect(await openLink(withToken(""))).toEqual(expired);
    // The real link still works: a wrong guess does not burn it.
    expect(await openLink(link)).toEqual(signedIn());
  });

  it("Две ссылки подряд: a new link cancels the previous one, the new one signs in", async () => {
    const first = await requestLink("anna@example.com");
    const second = await requestLink("anna@example.com");

    expect(await openLink(first)).toEqual(expired);
    expect(await openLink(second)).toEqual(signedIn());
  });

  it("a new link cancels only the links of its own address", async () => {
    const anna = await requestLink("anna@example.com");
    await requestLink("ivan@example.com");

    expect(await openLink(anna)).toEqual(signedIn());
  });

  it("Пробелы и большие буквы: « Anna@Example.COM » and anna@example.com are one user", async () => {
    expect(await openLink(await requestLink(" Anna@Example.COM "))).toEqual(signedIn());
    expect(await openLink(await requestLink("anna@example.com"))).toEqual(signedIn());

    const all = await getDb().select().from(users);
    expect(all.map((user) => user.email).filter((email) => /anna/i.test(email))).toEqual(["anna@example.com"]);
  });

  it("Ссылка текстом: the link from the plain-text version signs in like the button", async () => {
    await requestLink("anna@example.com");
    const plainLink = sentEmails[0].text.match(/^https?:\/\/\S+$/m)?.[0];

    expect(plainLink).toBe(signInLinkOf(sentEmails[0]));
    expect(await openLink(plainLink!)).toEqual(signedIn());
  });
});
