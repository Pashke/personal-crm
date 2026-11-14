import { sql } from "drizzle-orm";
import type { Pool } from "pg";
import { describe, expect, it } from "vitest";

import { requestSignInLink } from "@/app/(auth)/login/actions";
import { getDb } from "@/db";

import { openLink, requestLink } from "./setup/auth";
import { formDataOf } from "./setup/helpers";
import { emailsTo, failEmails, resetMailTrap, sentEmails } from "./setup/mail-trap";

// openspec user-auth: «Лимит писем» and «Сбой отправки письма».

const request = (email: string) => requestSignInLink({}, formDataOf({ email }));
const tooOften = { email: "anna@example.com", formError: "Слишком часто, попробуй через несколько минут" };
const notSent = { email: "anna@example.com", formError: "Не удалось отправить письмо. Попробуй ещё раз." };

describe("the email limit", () => {
  it("Четвёртое письмо: «Слишком часто…», no email, the link from the third email still signs in", async () => {
    await requestLink("anna@example.com");
    await requestLink("anna@example.com");
    const third = await requestLink("anna@example.com");

    expect(await request("anna@example.com")).toEqual(tooOften);

    expect(emailsTo("anna@example.com")).toHaveLength(3);
    expect((await openLink(third)).path).toBe("/");
  });

  it("Другая почта: the limit of one address does not stop another", async () => {
    for (let i = 0; i < 3; i++) await request("anna@example.com");
    expect(await request("anna@example.com")).toEqual(tooOften);

    expect(await request("ivan@example.com")).toEqual({ email: "ivan@example.com", sentTo: "ivan@example.com" });
    expect(emailsTo("ivan@example.com")).toHaveLength(1);
  });

  it("Прошло 10 минут: once the first of three emails is older than 10 minutes, a new one goes out", async () => {
    for (let i = 0; i < 3; i++) await request("anna@example.com");
    await getDb().execute(sql`
      update sign_in_emails set sent_at = sent_at - interval '10 minutes 1 second'
      where id = (select min(id) from sign_in_emails)
    `);

    expect(await request("anna@example.com")).toEqual({ email: "anna@example.com", sentTo: "anna@example.com" });
    expect(emailsTo("anna@example.com")).toHaveLength(4);
  });

  it("the address is counted as the server keeps it: « Anna@Example.COM » is anna@example.com", async () => {
    for (let i = 0; i < 3; i++) await request("anna@example.com");

    expect(await request(" Anna@Example.COM ")).toEqual({ ...tooOften, email: " Anna@Example.COM " });
  });

  it("two requests at the same moment with two emails already sent: only one more email goes out", async () => {
    await request("anna@example.com");
    await request("anna@example.com");

    const answers = await Promise.all([request("anna@example.com"), request("anna@example.com")]);

    expect(answers).toEqual(
      expect.arrayContaining([{ email: "anna@example.com", sentTo: "anna@example.com" }, tooOften]),
    );
    expect(emailsTo("anna@example.com")).toHaveLength(3);
  });

  // Every waiting request used to hold a database connection while the one in front of it needed
  // another: from 10 at once (the pool size) the whole app froze.
  it("twelve requests for one address at the same moment: three emails, nine «Слишком часто…», the app answers", async () => {
    const answers = await Promise.all(Array.from({ length: 12 }, () => request("anna@example.com")));

    expect(answers.filter((answer) => answer.sentTo)).toHaveLength(3);
    expect(answers.filter((answer) => answer.formError)).toEqual(Array(9).fill(tooOften));
    expect(emailsTo("anna@example.com")).toHaveLength(3);
    await expect(getDb().execute(sql`select 1`)).resolves.toBeDefined();
  });

  it("ten requests for ten addresses at the same moment: each address gets its email", async () => {
    const addresses = Array.from({ length: 10 }, (_, i) => `user${i}@example.com`);

    const answers = await Promise.all(addresses.map((address) => request(address)));

    expect(answers).toEqual(addresses.map((address) => ({ email: address, sentTo: address })));
    expect(sentEmails).toHaveLength(10);
  });

  it("old rows of the limit are deleted: an address is kept no longer than 10 minutes after its email", async () => {
    await request("ivan@example.com");
    await getDb().execute(sql`update sign_in_emails set sent_at = sent_at - interval '11 minutes'`);

    await request("anna@example.com");

    const { rows } = await getDb().execute<{ email: string }>(sql`select email from sign_in_emails`);
    expect(rows).toEqual([{ email: "anna@example.com" }]);
  });
});

describe("when the email cannot be sent", () => {
  it("Почтовый сервис не ответил: «Не удалось отправить письмо…», the attempt is not counted", async () => {
    await request("anna@example.com");
    await request("anna@example.com");
    failEmails();

    expect(await request("anna@example.com")).toEqual(notSent);
    expect(await request("anna@example.com")).toEqual(notSent);

    // Back up: two emails sent, so a third one is still allowed.
    resetMailTrap();
    expect(await request("anna@example.com")).toEqual({ email: "anna@example.com", sentTo: "anna@example.com" });
    expect(await request("anna@example.com")).toEqual(tooOften);
  });

  it("Почтовый сервис не ответил: the previous link keeps working", async () => {
    const link = await requestLink("anna@example.com");
    failEmails();

    expect(await request("anna@example.com")).toEqual(notSent);

    expect(sentEmails).toHaveLength(1);
    expect((await openLink(link)).path).toBe("/");
  });

  it("Почтовый сервис не ответил: the link of the email that did not go out is not kept", async () => {
    failEmails();

    expect(await request("anna@example.com")).toEqual(notSent);

    const { rows } = await getDb().execute<{ links: number }>(sql`select count(*)::int as links from verifications`);
    expect(rows).toEqual([{ links: 0 }]);
  });
});

describe("when the database has no free connection", () => {
  it("a request for a link waits about 10 seconds, then «Не удалось отправить письмо…» instead of hanging", async () => {
    const pool = (getDb() as unknown as { $client: Pool }).$client;
    const busy = await Promise.all(Array.from({ length: pool.options.max }, () => pool.connect()));
    try {
      const started = Date.now();

      expect(await request("anna@example.com")).toEqual(notSent);

      expect(Date.now() - started).toBeGreaterThanOrEqual(9_000);
      expect(sentEmails).toHaveLength(0);
    } finally {
      for (const connection of busy) connection.release();
    }
  }, 20_000);
});
