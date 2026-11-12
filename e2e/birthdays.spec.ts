import type { Page } from "@playwright/test";

import { daysAgo } from "../tests/setup/helpers";

import { resetData, seedContact } from "./support/db";
import { expect, signIn, test } from "./support/sign-in";

// openspec/specs/birthdays/spec.md (the change «birthdays»): the main paths in the browser.
// The calculations and texts behind these screens are covered by the Vitest tests.
// Dates are counted from the real "today" in Moscow, as the app counts them.

// The signed-in user's address: the contacts below are seeded for them.
let owner: string;

test.beforeEach(async ({ page }) => {
  await resetData();
  owner = await signIn(page);
});

const dayField = (page: Page) => page.getByRole("combobox", { name: "День", exact: true });
const monthField = (page: Page) => page.getByRole("combobox", { name: "Месяц", exact: true });
const yearField = (page: Page) => page.getByRole("textbox", { name: "Год", exact: true });
const birthdayField = (page: Page) => page.getByRole("group", { name: "День рождения" });
const submit = (page: Page) => page.getByRole("main").locator("form button[type=submit]").click();

// «День рождения» on the contact page.
const birthdayLine = (page: Page) =>
  page
    .locator("dl > div")
    .filter({ has: page.getByText("День рождения", { exact: true }) })
    .locator("dd");

// Today in Moscow, the day the app counts birthdays by.
function moscowToday() {
  const [day, month, year] = new Intl.DateTimeFormat("ru-RU", { timeZone: "Europe/Moscow" })
    .format(new Date())
    .split(".")
    .map(Number);
  return { year, month, day };
}

// Full years of someone born on 15 May 1990.
function ageOfBornOn15May1990() {
  const today = moscowToday();
  const hadBirthday = today.month > 5 || (today.month === 5 && today.day >= 15);
  return today.year - 1990 - (hadBirthday ? 0 : 1);
}

// "36 лет", "41 год", "42 года".
function years(count: number) {
  const mod10 = count % 10;
  const mod100 = count % 100;
  if (mod10 === 1 && mod100 !== 11) return `${count} год`;
  if (mod10 >= 2 && mod10 <= 4 && (mod100 < 12 || mod100 > 14)) return `${count} года`;
  return `${count} лет`;
}

async function fillBirthday(page: Page, day: string, month: string, year: string) {
  await dayField(page).selectOption(day);
  await monthField(page).selectOption({ label: month });
  await yearField(page).fill(year);
}

async function expectBirthdayFields(page: Page, day: string, month: string, year: string) {
  await expect(dayField(page)).toHaveValue(day);
  await expect(monthField(page)).toHaveValue(month);
  await expect(yearField(page)).toHaveValue(year);
}

test("birthday in the contact form: set, change, erase", async ({ page }) => {
  // Полная дата: the edit form shows 15, «мая» and 1990
  await page.goto("/contacts/new");
  await page.getByLabel("Имя").fill("Анна Соколова");
  await fillBirthday(page, "15", "мая", "1990");
  await submit(page);
  await page.getByRole("link", { name: "Анна Соколова" }).click();
  await expect(page.getByRole("heading", { name: "Анна Соколова" })).toBeVisible();
  // С годом: the date and the age on the contact page
  await expect(birthdayLine(page)).toHaveText(`15 мая 1990 · ${years(ageOfBornOn15May1990())}`);
  await page.getByRole("link", { name: "Изменить" }).click();
  await expectBirthdayFields(page, "15", "5", "1990");

  // Смена даты: 20 June, the year erased
  await fillBirthday(page, "20", "июня", "");
  await submit(page);
  await expect(page.getByRole("heading", { name: "Анна Соколова" })).toBeVisible();
  // Без года: only the date
  await expect(birthdayLine(page)).toHaveText("20 июня");
  await page.getByRole("link", { name: "Изменить" }).click();
  await expectBirthdayFields(page, "20", "6", "");

  // Стереть дату: the empty values of the lists
  await dayField(page).selectOption("");
  await monthField(page).selectOption("");
  await submit(page);
  await expect(page.getByRole("heading", { name: "Анна Соколова" })).toBeVisible();
  // Не задано: a dash
  await expect(birthdayLine(page)).toHaveText("—");
  await page.getByRole("link", { name: "Изменить" }).click();
  await expectBirthdayFields(page, "", "", "");
});

test("birthday that does not exist: an error under the field, what was chosen stays", async ({ page }) => {
  await page.goto("/contacts/new");
  await page.getByLabel("Имя").fill("Анна Соколова");
  await fillBirthday(page, "31", "апреля", "1990");
  await submit(page);

  await expect(birthdayField(page).getByText("Такой даты нет")).toBeVisible();
  await expectBirthdayFields(page, "31", "4", "1990");
  await expect(page.getByLabel("Имя")).toHaveValue("Анна Соколова");

  // An error in another field keeps the chosen date too.
  await page.getByLabel("Имя").fill(" ");
  await fillBirthday(page, "30", "апреля", "1990");
  await submit(page);
  await expect(page.getByText("Укажите имя")).toBeVisible();
  await expect(birthdayField(page).getByText("Такой даты нет")).toHaveCount(0);
  await expectBirthdayFields(page, "30", "4", "1990");
});

const birthdayBlock = (page: Page) => page.getByRole("region", { name: "Скоро день рождения" });
const dueBlock = (page: Page) => page.getByRole("region", { name: "Пора связаться" });
const groupsRow = (page: Page) => page.getByRole("navigation", { name: "Группы" });
const search = (page: Page) => page.getByRole("searchbox", { name: "Найти контакт по имени" });
const rowsOf = (names: string[]) => names.map((name) => new RegExp(name));

const monthNames = [
  "января",
  "февраля",
  "марта",
  "апреля",
  "мая",
  "июня",
  "июля",
  "августа",
  "сентября",
  "октября",
  "ноября",
  "декабря",
];

// The day `days` after today in Moscow, and how the block words it: "13 ноября".
function inDays(days: number) {
  const today = moscowToday();
  const date = new Date(Date.UTC(today.year, today.month - 1, today.day + days));
  const day = date.getUTCDate();
  const month = date.getUTCMonth() + 1;
  return { day, month, year: date.getUTCFullYear(), text: `${day} ${monthNames[month - 1]}` };
}

async function topOf(page: Page, locator: ReturnType<Page["locator"]>) {
  const box = await locator.boundingBox();
  if (!box) throw new Error("The element is not on the page");
  return box.y;
}

test("«Скоро день рождения» on the home page: above «Пора связаться», a row opens the contact", async ({ page }) => {
  const today = inDays(0);
  const tomorrow = inDays(1);
  const inFive = inDays(5);
  await seedContact(owner, {
    name: "Иван Петров",
    birthday: { day: today.day, month: today.month, year: today.year - 40 },
    groups: ["Семья"],
  });
  // Both in this block and in «Пора связаться».
  const anna = await seedContact(owner, {
    name: "Анна Соколова",
    birthday: { day: tomorrow.day, month: tomorrow.month, year: tomorrow.year - 36 },
    frequency: "week",
    createdAt: daysAgo(30),
  });
  await seedContact(owner, { name: "Олег Ким", birthday: { day: inFive.day, month: inFive.month } });
  await seedContact(owner, { name: "Вера Белова", birthday: { day: inDays(8).day, month: inDays(8).month } });
  await seedContact(owner, { name: "Борис Иванов" });

  await page.goto("/");

  // Сортировка по дате; «Через 8 дней» and «Без даты рождения» are not in the block
  await expect(birthdayBlock(page).getByRole("link")).toHaveText(rowsOf(["Иван Петров", "Анна Соколова", "Олег Ким"]));

  // Строка контакта: the name, the date, when, and the age if the year is known
  await expect(birthdayBlock(page).getByRole("link", { name: /Иван Петров/ })).toHaveText(
    `ИПИван Петров${today.text} · сегодня · исполняется 40`,
  );
  await expect(birthdayBlock(page).getByRole("link", { name: /Анна Соколова/ })).toHaveText(
    `АСАнна Соколова${tomorrow.text} · завтра · исполнится 36`,
  );
  await expect(birthdayBlock(page).getByRole("link", { name: /Олег Ким/ })).toHaveText(
    `ОКОлег Ким${inFive.text} · через 5 дней`,
  );

  // Три и меньше: all three are shown, no «Показать всех»
  await expect(birthdayBlock(page).getByRole("button", { name: "Показать всех" })).toHaveCount(0);

  // Над «Пора связаться»: groups, then this block, then «Пора связаться», then the search
  await expect(dueBlock(page).getByRole("link", { name: /Анна Соколова/ })).toBeVisible();
  const groupsTop = await topOf(page, groupsRow(page));
  const birthdaysTop = await topOf(page, birthdayBlock(page));
  const dueTop = await topOf(page, dueBlock(page));
  const searchTop = await topOf(page, search(page));
  expect(groupsTop).toBeLessThan(birthdaysTop);
  expect(birthdaysTop).toBeLessThan(dueTop);
  expect(dueTop).toBeLessThan(searchTop);

  // Общий список не меняется: everyone in their place by the alphabet
  await expect(page.locator('li[id^="contact-"]')).toHaveText(
    rowsOf(["Анна Соколова", "Борис Иванов", "Вера Белова", "Иван Петров", "Олег Ким"]),
  );

  // Переход на страницу контакта
  await birthdayBlock(page)
    .getByRole("link", { name: /Анна Соколова/ })
    .click();
  await expect(page).toHaveURL(new RegExp(`/contacts/${anna}$`));
  await expect(page.getByRole("heading", { name: "Анна Соколова" })).toBeVisible();
});

test("«Скоро день рождения»: a long block, and when it is hidden", async ({ page }) => {
  // The further in the alphabet, the sooner the birthday, so the order is not the alphabet's.
  const family = ["Глеб", "Вера", "Борис"];
  for (const [index, name] of family.entries()) {
    const date = inDays(index);
    await seedContact(owner, { name, birthday: { day: date.day, month: date.month }, groups: ["Семья"] });
  }
  await seedContact(owner, {
    name: "Анна",
    birthday: { day: inDays(3).day, month: inDays(3).month },
    groups: ["Теннис"],
  });
  await seedContact(owner, {
    name: "Дина",
    birthday: { day: inDays(4).day, month: inDays(4).month },
    groups: ["Семья"],
  });
  await seedContact(owner, { name: "Яна", groups: ["Друзья"] });
  const byDate = [...family, "Анна", "Дина"];

  await page.goto("/");

  // Больше трёх: the first three, then all five in the same order, then three again
  await expect(birthdayBlock(page).getByRole("link")).toHaveText(rowsOf(byDate.slice(0, 3)));
  await birthdayBlock(page).getByRole("button", { name: "Показать всех" }).click();
  await expect(birthdayBlock(page).getByRole("link")).toHaveText(rowsOf(byDate));
  await birthdayBlock(page).getByRole("button", { name: "Свернуть" }).click();
  await expect(birthdayBlock(page).getByRole("link")).toHaveText(rowsOf(byDate.slice(0, 3)));

  // Идёт поиск: the block is hidden while a name is typed, back when the search is cleared
  await search(page).fill("Ве");
  await expect(page.getByText("Найдено 1 из 6")).toBeVisible();
  await expect(birthdayBlock(page)).toHaveCount(0);
  await search(page).fill("");
  await expect(birthdayBlock(page)).toBeVisible();

  // Выбрана группа: only Анна from «Теннис»; «Все» brings everyone back
  await groupsRow(page).getByRole("link", { name: "Теннис" }).click();
  await expect(page.getByText("Найдено 1 из 6")).toBeVisible();
  await expect(birthdayBlock(page).getByRole("link")).toHaveText(rowsOf(["Анна"]));
  await groupsRow(page).getByRole("link", { name: "Все" }).click();
  await expect(birthdayBlock(page).getByRole("link")).toHaveText(rowsOf(byDate.slice(0, 3)));

  // В группе ни у кого: no block for «Друзья», back with «Все»
  await groupsRow(page).getByRole("link", { name: "Друзья" }).click();
  await expect(page.getByText("Найдено 1 из 6")).toBeVisible();
  await expect(birthdayBlock(page)).toHaveCount(0);
  await groupsRow(page).getByRole("link", { name: "Все" }).click();
  await expect(birthdayBlock(page)).toBeVisible();
});
