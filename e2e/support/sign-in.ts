import { test as base, expect, type Browser, type Page } from "@playwright/test";

import { emailsTo, signInLinkOf, uniqueEmail, waitForEmail } from "../../tests/setup/mailpit";

export { expect, uniqueEmail };

// The app runs in production mode here, with Better Auth's own per-IP request limits on
// (5 sign-in links a minute). On the server nginx puts the visitor's address into X-Real-IP; here
// every test is its own visitor, so tests do not share one limit.
let visitor = 0;
const runId = Math.floor(Math.random() * 200);

function nextVisitorIp() {
  visitor++;
  return `10.${runId}.${Math.floor(visitor / 250)}.${(visitor % 250) + 1}`;
}

export const test = base.extend({
  extraHTTPHeaders: async ({}, provide) => {
    await provide({ "X-Real-IP": nextVisitorIp() });
  },
});

// Another device: a clean browser profile without the cookies of the test's page, a visitor of its own.
export async function newDevice(browser: Browser) {
  return browser.newContext({ extraHTTPHeaders: { "X-Real-IP": nextVisitorIp() } });
}

// Signs the page's browser in the way a person does: the form, the email in the mail stub, the link.
// Ends on the home page. Returns the address.
export async function signIn(page: Page, email = uniqueEmail()) {
  const before = (await emailsTo(email)).length;

  await page.goto("/login");
  await page.getByLabel("Почта").fill(email);
  await page.getByRole("button", { name: "Получить ссылку" }).click();
  await expect(page.getByText(`Ссылка для входа отправлена на ${email}`)).toBeVisible();

  const link = signInLinkOf(await waitForEmail(email, { count: before + 1 }));
  await page.goto(link);
  await expect(page).toHaveURL(/\/$/);
  await expect(page.getByRole("banner").getByText(email)).toBeVisible();
  return email;
}
