import { expect, test, type Page } from "@playwright/test";

import { DAY_MS, daysAgo, msAgo } from "../tests/setup/helpers";

import { resetData, seedContact } from "./support/db";

// openspec/specs/keep-in-touch/spec.md: the main paths through «Пора связаться».
// The calculations and texts behind these screens are covered by the Vitest tests.

test.beforeEach(async () => {
  await resetData();
});

const dueBlock = (page: Page) => page.getByRole("region", { name: "Пора связаться" });
const dueRow = (page: Page, name: string) => dueBlock(page).getByRole("link", { name });
const checkButton = (page: Page, name: string) => page.getByRole("button", { name: `Уже связался с ${name}` });
const quickNote = (page: Page, name: string) => page.getByRole("textbox", { name: `Короткая заметка: ${name}` });
// «Как часто общаться» on the contact page.
const frequencyLine = (page: Page) =>
  page
    .locator("dl > div")
    .filter({ has: page.getByText("Как часто общаться") })
    .locator("dd");

// The radio buttons of «Как часто общаться» are drawn as toggles: the user clicks the label.
async function chooseFrequency(page: Page, label: string) {
  await page
    .locator("label")
    .filter({ hasText: new RegExp(`^${label}$`) })
    .click();
  await expect(page.getByRole("radio", { name: label })).toBeChecked();
}

// "15 ноября", with the year when it is not the current one: the way the contact page words a date.
function dayMonth(date: Date) {
  const text = new Intl.DateTimeFormat("ru-RU", { day: "numeric", month: "long" }).format(date);
  return date.getFullYear() === new Date().getFullYear() ? text : `${text} ${date.getFullYear()}`;
}

test("frequency on the contact card: set, change, reset", async ({ page }) => {
  // Новый контакт с частотой
  await page.goto("/contacts/new");
  await page.getByLabel("Имя").fill("Анна Соколова");
  await chooseFrequency(page, "Раз в месяц");
  await page.locator("form button[type=submit]").click();
  await page.getByRole("link", { name: "Анна Соколова" }).click();
  await expect(page.getByRole("heading", { name: "Анна Соколова" })).toBeVisible();
  await expect(frequencyLine(page)).toHaveText(/^Раз в месяц · следующий раз до \d{1,2} [а-я]+( \d{4})?$/);

  // Смена частоты: the edit form shows the saved value, then the new one
  await page.getByRole("link", { name: "Изменить" }).click();
  await expect(page.getByRole("radio", { name: "Раз в месяц" })).toBeChecked();
  await chooseFrequency(page, "Раз в неделю");
  await page.locator("form button[type=submit]").click();
  await expect(frequencyLine(page)).toHaveText(
    `Раз в неделю · следующий раз до ${dayMonth(new Date(Date.now() + 7 * DAY_MS))}`,
  );
  await page.getByRole("link", { name: "Изменить" }).click();
  await expect(page.getByRole("radio", { name: "Раз в неделю" })).toBeChecked();

  // Сброс частоты, «Частота не задана»: a dash on the contact page
  await chooseFrequency(page, "Не задано");
  await page.locator("form button[type=submit]").click();
  await expect(page.getByRole("heading", { name: "Анна Соколова" })).toBeVisible();
  await expect(frequencyLine(page)).toHaveText("—");
});

test("got in touch: a quick note from the block", async ({ page }) => {
  const anna = await seedContact({
    name: "Анна Соколова",
    frequency: "week",
    createdAt: daysAgo(100),
    notes: [{ body: "Обсудили отпуск", createdAt: msAgo(19 * DAY_MS + 60 * 60 * 1000) }],
  });
  const oleg = await seedContact({ name: "Олег Ким", frequency: "year", createdAt: daysAgo(400) });
  await seedContact({ name: "Борис Иванов" });

  await page.goto("/");

  // Строка контакта в блоке: the name, the frequency and how long ago, the most overdue first
  await expect(dueBlock(page).getByRole("link")).toHaveText([/Олег Ким/, /Анна Соколова/]);
  for (const text of ["Олег Ким", "раз в год", "ещё не общались"]) {
    await expect(dueRow(page, "Олег Ким")).toContainText(text);
  }
  for (const text of ["Анна Соколова", "раз в неделю", "последний раз 19 дней назад"]) {
    await expect(dueRow(page, "Анна Соколова")).toContainText(text);
  }

  // Общий список не меняется: Анна is in her place by the alphabet and looks like the others
  await expect(page.locator('li[id^="contact-"]')).toHaveText([/Анна Соколова/, /Борис Иванов/, /Олег Ким/]);
  await expect(page.locator(`#contact-${anna}`)).not.toContainText("раз в неделю");
  await expect(page.locator(`#contact-${anna}`)).not.toContainText("последний раз");

  // Открыть поле: the cursor is in the field, the contact page does not open
  await checkButton(page, "Анна Соколова").click();
  await expect(quickNote(page, "Анна Соколова")).toBeFocused();
  await expect(dueBlock(page).getByRole("button", { name: "Отмена" })).toBeVisible();
  await expect(page).toHaveURL(/\/$/);

  // С текстом: the contact leaves the block
  await quickNote(page, "Анна Соколова").fill("Созвонились, договорились о встрече");
  await dueBlock(page).getByRole("button", { name: "Сохранить" }).click();
  await expect(page.getByText("Заметка сохранена")).toBeVisible();
  await expect(dueRow(page, "Анна Соколова")).toHaveCount(0);

  // Не отменил: the notice is gone after 5 seconds, and so is «Отменить»
  await expect(page.getByText("Заметка сохранена")).toBeHidden({ timeout: 10_000 });
  await expect(page.getByRole("button", { name: "Отменить" })).toHaveCount(0);
  await page.reload();
  await expect(dueBlock(page).getByRole("link")).toHaveText([/Олег Ким/]);

  // Переход на страницу контакта: a click on the row, not on the button
  await dueRow(page, "Олег Ким").click();
  await expect(page).toHaveURL(new RegExp(`/contacts/${oleg}$`));
  await expect(page.getByRole("heading", { name: "Олег Ким" })).toBeVisible();

  // The note is the first one on the contact page, dated today; «После новой заметки»: the next due date
  await page.goto(`/contacts/${anna}`);
  const firstNote = page.getByRole("listitem").first();
  await expect(firstNote).toContainText("Созвонились, договорились о встрече");
  await expect(firstNote).toContainText(
    new Intl.DateTimeFormat("ru-RU", { day: "numeric", month: "long" }).format(new Date()),
  );
  await expect(frequencyLine(page)).toHaveText(
    `Раз в неделю · следующий раз до ${dayMonth(new Date(Date.now() + 7 * DAY_MS))}`,
  );
});

test("undo a quick note saved by mistake", async ({ page }) => {
  await seedContact({ name: "Анна", frequency: "week", createdAt: daysAgo(40) });
  const ivan = await seedContact({
    name: "Иван",
    frequency: "week",
    createdAt: daysAgo(60),
    notes: [{ body: "Встретились на кофе", createdAt: daysAgo(20) }],
  });
  await seedContact({ name: "Олег", frequency: "week", createdAt: daysAgo(10) });

  await page.goto("/");
  // Сортировка по сроку; «Три и меньше»: all three are shown, no «Показать всех»
  await expect(dueBlock(page).getByRole("link")).toHaveText([/Анна/, /Иван/, /Олег/]);
  await expect(page.getByRole("button", { name: "Показать всех" })).toHaveCount(0);

  // Ctrl+Enter in an empty field saves «Связались»
  await checkButton(page, "Иван").click();
  await quickNote(page, "Иван").press("Control+Enter");
  await expect(page.getByText("Заметка сохранена")).toBeVisible();
  await expect(dueBlock(page).getByRole("link")).toHaveText([/Анна/, /Олег/]);

  // Отменил: Иван is back in his place
  await page.getByRole("button", { name: "Отменить" }).click();
  await expect(dueBlock(page).getByRole("link")).toHaveText([/Анна/, /Иван/, /Олег/]);
  await page.reload();
  await expect(dueBlock(page).getByRole("link")).toHaveText([/Анна/, /Иван/, /Олег/]);

  // Другие заметки не трогаются: only the quick note is gone
  await page.goto(`/contacts/${ivan}`);
  await expect(page.getByRole("listitem")).toHaveText([/Встретились на кофе/]);
  await expect(page.getByText("Связались")).toHaveCount(0);
});

test("changed my mind, or the note could not be saved", async ({ page, context }) => {
  await seedContact({ name: "Анна", frequency: "week", createdAt: daysAgo(40) });
  await seedContact({ name: "Иван", frequency: "week", createdAt: daysAgo(30) });
  await page.goto("/");

  // Отмена: the field closes, nothing is saved
  await checkButton(page, "Анна").click();
  await quickNote(page, "Анна").fill("Черновик");
  await dueBlock(page).getByRole("button", { name: "Отмена" }).click();
  await expect(quickNote(page, "Анна")).toHaveCount(0);
  await page.reload();
  await expect(dueRow(page, "Анна")).toContainText("ещё не общались");

  // Только одно поле: opening Иван's field closes Анна's with its text
  await checkButton(page, "Анна").click();
  await quickNote(page, "Анна").fill("Текст для Анны");
  await checkButton(page, "Иван").click();
  await expect(quickNote(page, "Анна")).toHaveCount(0);
  await expect(quickNote(page, "Иван")).toBeFocused();
  await checkButton(page, "Анна").click();
  await expect(quickNote(page, "Иван")).toHaveCount(0);
  await expect(quickNote(page, "Анна")).toHaveValue("");

  // Слишком длинная заметка: an error under the field, the text stays
  const long = "а".repeat(10_001);
  await quickNote(page, "Анна").fill(long);
  await dueBlock(page).getByRole("button", { name: "Сохранить" }).click();
  await expect(dueBlock(page).getByText("Слишком длинная заметка")).toBeVisible();
  await expect(quickNote(page, "Анна")).toHaveValue(long);

  // Не удалось сохранить: the browser is really cut off from the network
  await quickNote(page, "Анна").fill("Созвонились");
  await context.setOffline(true);
  await dueBlock(page).getByRole("button", { name: "Сохранить" }).click();
  await expect(dueBlock(page).getByText("Не удалось сохранить заметку. Попробуйте ещё раз.")).toBeVisible();
  await expect(quickNote(page, "Анна")).toHaveValue("Созвонились");
  await expect(dueRow(page, "Анна")).toBeVisible();

  // Back online, the same button saves the note
  await context.setOffline(false);
  await dueBlock(page).getByRole("button", { name: "Сохранить" }).click();
  await expect(page.getByText("Заметка сохранена")).toBeVisible();
  await expect(dueBlock(page).getByRole("link")).toHaveText([/Иван/]);
});

test("Никому не пора: no block on the home page", async ({ page }) => {
  await seedContact({ name: "Анна", frequency: "month" });
  await seedContact({ name: "Иван", createdAt: daysAgo(400) });

  await page.goto("/");

  await expect(page.getByRole("link", { name: "Анна" })).toBeVisible();
  await expect(dueBlock(page)).toHaveCount(0);
});

test("a long block, and when it is hidden", async ({ page }) => {
  // Twelve due contacts: the further in the alphabet, the more overdue, so the order is the reverse one.
  const names = ["Алла", "Борис", "Вера", "Глеб", "Дина", "Егор", "Жанна", "Зоя", "Игорь", "Кира", "Лев", "Мария"];
  for (const [index, name] of names.entries()) {
    await seedContact({ name, frequency: "week", createdAt: daysAgo(10 + index), groups: ["Семья"] });
  }
  await seedContact({ name: "Яна", frequency: "month", groups: ["Теннис"] });
  const byDue = [...names].reverse();
  const rowsOf = (list: string[]) => list.map((name) => new RegExp(name));

  await page.goto("/");

  // Больше трёх: the first three, then all twelve in the same order, then three again
  await expect(dueBlock(page).getByRole("link")).toHaveText(rowsOf(byDue.slice(0, 3)));
  await page.getByRole("button", { name: "Показать всех" }).click();
  await expect(dueBlock(page).getByRole("link")).toHaveText(rowsOf(byDue));
  await page.getByRole("button", { name: "Свернуть" }).click();
  await expect(dueBlock(page).getByRole("link")).toHaveText(rowsOf(byDue.slice(0, 3)));

  // Идёт поиск: the block is hidden while a name is typed
  const search = page.getByRole("searchbox", { name: "Найти контакт по имени" });
  await search.fill("Мар");
  await expect(page.getByText("Найдено 1 из 13")).toBeVisible();
  await expect(dueBlock(page)).toHaveCount(0);
  await search.fill("");
  await expect(dueBlock(page)).toBeVisible();

  // В группе никому не пора: no block for «Теннис», back with «Все»
  const groups = page.getByRole("navigation", { name: "Группы" });
  await groups.getByRole("link", { name: "Теннис" }).click();
  await expect(page.getByText("Найдено 1 из 13")).toBeVisible();
  await expect(dueBlock(page)).toHaveCount(0);
  await groups.getByRole("link", { name: "Все" }).click();
  await expect(dueBlock(page)).toBeVisible();
});
