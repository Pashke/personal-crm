import type { Page } from "@playwright/test";

import { emailsTo, signInLinkOf, waitForEmail } from "../tests/setup/mailpit";

import { resetData, seedContact } from "./support/db";
import { expect, newDevice, signIn, test, uniqueEmail } from "./support/sign-in";

// openspec/changes/login/specs/user-auth: signing in with a link from an email, in a real browser,
// with real emails in the mail stub (Mailpit). Every test uses addresses of its own.

test.beforeEach(async () => {
  await resetData();
});

const header = (page: Page) => page.getByRole("banner");
const emailField = (page: Page) => page.getByLabel("Почта");
const getLinkButton = (page: Page) => page.getByRole("button", { name: "Получить ссылку" });

async function requestLink(page: Page, email: string) {
  await page.goto("/login");
  await emailField(page).fill(email);
  await getLinkButton(page).click();
}

// «Страница входа»: only «Личная CRM» in the header.
async function expectSignInPage(page: Page) {
  await expect(page).toHaveURL(/\/login$/);
  await expect(emailField(page)).toBeVisible();
  await expect(getLinkButton(page)).toBeVisible();
  await expect(header(page).getByRole("link")).toHaveText(["Личная CRM"]);
  await expect(header(page).getByRole("button")).toHaveCount(0);
}

test("main sign-in scenario: the sign-in page, the email, the link, «Выйти»", async ({ page }) => {
  const email = uniqueEmail("anna");

  // 1. Открыл приложение без входа: the sign-in page and what it says
  await page.goto("/");
  await expectSignInPage(page);
  for (const text of [
    "Люди, которых знаю лично",
    "Кто это, откуда знакомы, о чём договорились — в одном месте.",
    "чтобы не терять людей и контекст общения",
    "Пароль не нужен — пришлём ссылку на почту.",
    "Ссылка работает 15 минут.",
  ]) {
    await expect(page.getByText(text, { exact: true })).toBeVisible();
  }
  await expect(page.getByRole("heading", { name: "Вход", exact: true })).toBeVisible();

  // 2. The address: «Ссылка для входа отправлена на <почта>», the form stays, the email arrives
  await emailField(page).fill(email);
  await getLinkButton(page).click();
  await expect(page.getByRole("status")).toHaveText(`Ссылка для входа отправлена на ${email}`);
  await expect(emailField(page)).toHaveValue(email);
  const letter = await waitForEmail(email);
  expect(letter.from).toEqual({ name: "Личная CRM", address: "noreply@mail.crm.whobook.ru" });
  expect(letter.subject).toBe("Вход в Личную CRM");
  expect(letter.html).toMatch(/>\s*Войти\s*<\/a>/);

  // 3. The link from the email: inside, the user's own (empty) list, the address and «Выйти» in the header
  await page.goto(signInLinkOf(letter));
  await expect(page).toHaveURL(/\/$/);
  await expect(page.getByRole("heading", { name: "Контакты" })).toBeVisible();
  await expect(header(page).getByText(email)).toBeVisible();

  // 4. «Выйти»: the sign-in page, and the app's addresses lead there again
  await header(page).getByRole("button", { name: "Выйти" }).click();
  await expectSignInPage(page);
  await page.goto("/");
  await expectSignInPage(page);
});

test("На телефоне: the «Вход» panel is under the texts, no sideways scrolling", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/login");

  const tagline = await page.getByText("чтобы не терять людей и контекст общения").boundingBox();
  const panel = await page.getByRole("region", { name: "Вход" }).boundingBox();
  expect(panel!.y).toBeGreaterThan(tagline!.y + tagline!.height);
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(390);
});

test("Шапка and the way to «Группы»: the address and «Выйти» on every page", async ({ page }) => {
  const email = await signIn(page, uniqueEmail("anna"));
  const anna = await seedContact(email, { name: "Анна Соколова" });

  for (const path of ["/", `/contacts/${anna}`, "/groups"]) {
    await page.goto(path);
    await expect(header(page).getByText(email)).toBeVisible();
    await expect(header(page).getByRole("button", { name: "Выйти" })).toBeVisible();
  }

  // Переход на страницу «Группы»: from the home page and from a contact page
  for (const path of ["/", `/contacts/${anna}`]) {
    await page.goto(path);
    await header(page).getByRole("link", { name: "Группы" }).click();
    await expect(page.getByRole("heading", { name: "Группы" })).toBeVisible();
  }
});

test("Прямой адрес без входа and «Проверка сервера без входа»", async ({ page, request }) => {
  const email = await signIn(page, uniqueEmail("anna"));
  const anna = await seedContact(email, { name: "Анна Соколова", groups: ["Теннис"] });
  await header(page).getByRole("button", { name: "Выйти" }).click();
  await expectSignInPage(page);

  for (const path of [`/contacts/${anna}`, `/contacts/${anna}/edit`, "/groups", "/contacts/new"]) {
    await page.goto(path);
    await expectSignInPage(page);
    await expect(page.getByText("Анна Соколова")).toHaveCount(0);
    await expect(page.getByText("Теннис")).toHaveCount(0);
  }

  const health = await request.get("/health");
  expect(health.status()).toBe(200);
});

test("Неверный адрес: «Проверь адрес почты» under the field, no email", async ({ page }) => {
  const wrong = `${uniqueEmail("wrong").split("@")[0]}@`;

  await requestLink(page, wrong);

  await expect(page.getByText("Проверь адрес почты")).toBeVisible();
  await expect(emailField(page)).toHaveValue(wrong);
  await expect(emailField(page)).toHaveAttribute("aria-invalid", "true");
  await expect(page.getByRole("status")).toHaveCount(0);
  expect(await emailsTo(wrong)).toEqual([]);
});

test("Уже вошёл: the sign-in page opens the home page", async ({ page }) => {
  await signIn(page);

  await page.goto("/login");

  await expect(page).toHaveURL(/\/$/);
  await expect(page.getByRole("heading", { name: "Контакты" })).toBeVisible();
});

test("Повторное открытие and «На страницу входа»: a used link says «Ссылка устарела»", async ({ page, browser }) => {
  const email = await signIn(page);
  const link = signInLinkOf(await waitForEmail(email));

  // The same link again, in another browser: no second sign-in
  const other = await newDevice(browser);
  const otherPage = await other.newPage();
  await otherPage.goto(link);
  await expect(otherPage).toHaveURL(/\/login\/expired/);
  await expect(otherPage.getByRole("heading", { name: "Ссылка устарела, запроси новую" })).toBeVisible();
  await expect(otherPage.getByRole("banner").getByRole("link")).toHaveText(["Личная CRM"]);

  await otherPage.getByRole("link", { name: "На страницу входа" }).click();
  await expectSignInPage(otherPage);
  await other.close();
});

test("Другое устройство остаётся: «Выйти» on the phone keeps the computer signed in", async ({ page, browser }) => {
  const email = await signIn(page);
  const phone = await newDevice(browser);
  const phonePage = await phone.newPage();
  await signIn(phonePage, email);

  await phonePage.getByRole("banner").getByRole("button", { name: "Выйти" }).click();
  await expectSignInPage(phonePage);

  await page.reload();
  await expect(page.getByRole("heading", { name: "Контакты" })).toBeVisible();
  await expect(header(page).getByText(email)).toBeVisible();
  await phone.close();
});
