import { resetData } from "./support/db";
import { expect, newDevice, signIn, test, uniqueEmail } from "./support/sign-in";

// openspec/changes/login/specs/data-ownership: each user sees only their own contacts.
// The server-side rules behind these screens are covered by the Vitest tests.

test.beforeEach(async () => {
  await resetData();
});

// specs/02-пользователи-вход.md, «Критерий успеха»
test("success criterion: B sees A's contact neither in the list, nor in the search, nor by its address", async ({
  page,
  browser,
}) => {
  // A signs in and adds a contact
  await signIn(page, uniqueEmail("a"));
  await page.getByRole("link", { name: "Добавить контакт" }).click();
  await page.getByLabel("Имя").fill("Анна Соколова");
  await page.getByRole("main").locator("form button[type=submit]").click();
  const annaLink = page.getByRole("link", { name: "Анна Соколова" });
  await expect(annaLink).toBeVisible();
  const annaAddress = (await annaLink.getAttribute("href"))!;

  // B signs in on another device: an empty list, nothing found
  const deviceB = await newDevice(browser);
  const pageB = await deviceB.newPage();
  await signIn(pageB, uniqueEmail("b"));
  await expect(pageB.getByRole("link", { name: "Анна Соколова" })).toHaveCount(0);
  await pageB.getByRole("searchbox", { name: "Найти контакт по имени" }).fill("Соколова");
  await expect(pageB.getByText("Никого не нашлось по запросу «Соколова»")).toBeVisible();

  // Прямая ссылка на чужой контакт and «Изменить» чужого контакта: «Контакт не найден», nothing of A's
  for (const address of [annaAddress, `${annaAddress}/edit`]) {
    await pageB.goto(address);
    await expect(pageB.getByRole("heading", { name: "Контакт не найден" })).toBeVisible();
    await expect(pageB.getByText("Анна Соколова")).toHaveCount(0);
  }

  // Контакта нет: a made-up number looks the same
  await pageB.goto("/contacts/999999");
  await expect(pageB.getByRole("heading", { name: "Контакт не найден" })).toBeVisible();
  await expect(pageB.getByText("Возможно, контакт удалён или в адресе опечатка.")).toBeVisible();
  await pageB.getByRole("link", { name: "К списку контактов" }).click();
  await expect(pageB.getByRole("heading", { name: "Контакты" })).toBeVisible();

  // Any other wrong address is still «Такой страницы нет»
  await pageB.goto("/abc");
  await expect(pageB.getByRole("heading", { name: "Такой страницы нет" })).toBeVisible();
  await deviceB.close();

  // A still has the contact
  await page.reload();
  await expect(page.getByRole("link", { name: "Анна Соколова" })).toBeVisible();
});

test("Первый вход нового пользователя: an empty list with «Добавь первый контакт», no groups", async ({ page }) => {
  const email = await signIn(page, uniqueEmail("new"));

  await expect(page.getByRole("banner").getByText(email)).toBeVisible();
  await expect(page.getByText("0 контактов")).toBeVisible();
  await expect(page.locator('li[id^="contact-"]')).toHaveCount(0);
  await expect(page.getByRole("link", { name: "Добавь первый контакт" })).toBeVisible();
  await expect(page.getByRole("navigation", { name: "Группы" })).toHaveCount(0);
  await expect(page.getByRole("region", { name: "Пора связаться" })).toHaveCount(0);

  await page.goto("/groups");
  await expect(page.getByText("Групп пока нет")).toBeVisible();
});

test("Подсказка: «Добавь первый контакт» opens «Новый контакт»", async ({ page }) => {
  await signIn(page);

  await page.getByRole("link", { name: "Добавь первый контакт" }).click();

  await expect(page).toHaveURL(/\/contacts\/new$/);
  await expect(page.getByRole("heading", { name: "Новый контакт" })).toBeVisible();
});
