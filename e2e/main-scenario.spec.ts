import { expect, test } from "@playwright/test";

import { resetData, seedContacts } from "./support/db";

const seeded = ["Анна Смирнова", "Борис Иванов", "Виктор Петров"];
const newName = "Ольга Кузнецова";
const noteText = "Договорились созвониться в пятницу и обсудить поездку";

test.beforeEach(async () => {
  await resetData();
  await seedContacts(seeded);
});

// specs/01-продуктовая-идея.md, «Главный сценарий»
test("main scenario: list, add a contact, find it, add a note, see the same in another browser", async ({
  page,
  browser,
}) => {
  // 1. Open: the list of all contacts
  await page.goto("/");
  await expect(page.getByRole("heading", { name: "Контакты" })).toBeVisible();
  await expect(page.getByText("3 контакта")).toBeVisible();
  for (const name of seeded) {
    await expect(page.getByRole("link", { name })).toBeVisible();
  }

  // 2. Add a contact: it appears in the list
  await page.getByRole("link", { name: "Добавить контакт" }).click();
  await page.getByLabel("Имя").fill(newName);
  await page.getByLabel("Откуда знакомы").fill("Познакомились на конференции");
  // The groups block has its own «Добавить»: the form's one is the submit button
  await page.locator("form button[type=submit]").click();
  await expect(page.getByText("4 контакта")).toBeVisible();
  await expect(page.getByRole("link", { name: newName })).toBeVisible();

  // 3. Find it by name, open the card, write a note after the conversation
  await page.getByRole("searchbox", { name: "Найти контакт по имени" }).fill("Кузнецова");
  await expect(page.getByText("Найдено 1 из 4")).toBeVisible();
  await expect(page.getByRole("link", { name: "Анна Смирнова" })).toHaveCount(0);
  await page.getByRole("link", { name: newName }).click();
  await expect(page.getByRole("heading", { name: newName })).toBeVisible();

  await page.getByRole("textbox", { name: "Новая заметка" }).fill(noteText);
  await page.getByRole("button", { name: "Добавить заметку" }).click();
  await expect(page.getByText("Заметка сохранена")).toBeVisible();

  // The note is saved in the card: it survives a reload
  await page.reload();
  await expect(page.getByRole("list").getByText(noteText)).toBeVisible();

  // Another browser (a clean profile, no shared cookies) at the same address: the same contacts and the note
  const other = await browser.newContext();
  const otherPage = await other.newPage();
  await otherPage.goto("/");
  await expect(otherPage.getByText("4 контакта")).toBeVisible();
  for (const name of [...seeded, newName]) {
    await expect(otherPage.getByRole("link", { name })).toBeVisible();
  }
  await otherPage.getByRole("link", { name: newName }).click();
  await expect(otherPage.getByText(noteText)).toBeVisible();
  await other.close();
});
