import { describe, expect, it, vi } from "vitest";

import { signInEmail } from "@/lib/sign-in-email";

import { uniqueEmail, waitForEmail } from "./setup/mailpit";

// The other tests catch emails before they leave (tests/setup/each-file.ts); this one sends a real
// email through SMTP_URL to the mail stub (Mailpit from docker-compose.yml).
const { sendMail } = await vi.importActual<typeof import("@/lib/mail")>("@/lib/mail");

describe("sending emails", () => {
  it("Письмо в заглушке: an email to any address, even a made-up one, shows up in Mailpit", async () => {
    const to = uniqueEmail("nobody");
    const url = "http://localhost:3000/api/auth/magic-link/verify?token=abc123";

    await sendMail({ to, ...signInEmail(url) });

    const email = await waitForEmail(to);
    expect(email.from).toEqual({ name: "Личная CRM", address: "noreply@mail.crm.whobook.ru" });
    expect(email.to).toEqual([to]);
    expect(email.subject).toBe("Вход в Личную CRM");
    expect(email.text).toContain(url);
    expect(email.html).toContain("Вход в Личную CRM");
  });
});
