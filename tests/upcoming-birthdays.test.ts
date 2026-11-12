import { describe, expect, it } from "vitest";

import { deleteContact } from "@/app/actions";
import { listContacts, listUpcomingBirthdaysForHome } from "@/lib/contacts";

import { userA } from "./setup/current-user";
import { addToGroups, createContactRow, createGroups } from "./setup/factories";
import { redirectTarget } from "./setup/helpers";

// openspec birthdays: «Блок «Скоро день рождения» на главной», «Порядок в блоке», «Когда блок скрыт».
// "Today" is passed in, so the tests do not depend on the clock.

const NOV_12 = { year: 2026, month: 11, day: 12 };

const born = (name: string, day: number, month: number, year: number | null = null) =>
  createContactRow({ name, birthDay: day, birthMonth: month, birthYear: year });

const upcoming = async ({ query = "", groupId = null as number | null, today = NOV_12 } = {}) =>
  (await listUpcomingBirthdaysForHome(userA().id, query, groupId, today)).map((row) => row.name);

describe("listUpcomingBirthdaysForHome", () => {
  it("Сегодня: a birthday today is in the block", async () => {
    await born("Иван", 12, 11);

    expect(await upcoming()).toEqual(["Иван"]);
  });

  it("Через 7 дней: in the block", async () => {
    await born("Анна", 19, 11);

    expect(await upcoming()).toEqual(["Анна"]);
  });

  it("Через 8 дней: not in the block", async () => {
    await born("Олег", 20, 11);

    expect(await upcoming()).toEqual([]);
  });

  it("Вчера: not in the block", async () => {
    await born("Вера", 11, 11);

    expect(await upcoming()).toEqual([]);
  });

  it("Без даты рождения: not in the block", async () => {
    await createContactRow({ name: "Анна" });

    expect(await upcoming()).toEqual([]);
  });

  it("returns the birthday, the date it falls on, the days to it and the age it brings", async () => {
    const anna = await born("Анна Соколова", 13, 11, 1990);

    expect(await listUpcomingBirthdaysForHome(userA().id, "", null, NOV_12)).toEqual([
      {
        id: anna.id,
        name: "Анна Соколова",
        birthday: { day: 13, month: 11, year: 1990 },
        next: { date: { year: 2026, month: 11, day: 13 }, days: 1, turning: 36 },
      },
    ]);
  });

  it("Выбрана группа: only the group's contacts, and «Все» brings the rest back", async () => {
    const [family, , tennis] = await createGroups("Семья", "Друзья", "Теннис");
    const anna = await born("Анна", 13, 11);
    const ivan = await born("Иван", 14, 11);
    await addToGroups(anna.id, [tennis.id]);
    await addToGroups(ivan.id, [family.id]);

    expect(await upcoming({ groupId: tennis.id })).toEqual(["Анна"]);
    expect(await upcoming({ groupId: null })).toEqual(["Анна", "Иван"]);
  });

  it("Удалённый контакт: gone from the block and from the list", async () => {
    const anna = await born("Анна", 13, 11);

    await redirectTarget(() => deleteContact(anna.id));

    expect(await upcoming()).toEqual([]);
    expect(await listContacts(userA().id, "")).toEqual([]);
  });

  it("Общий список не меняется: a contact from the block keeps its place in the list", async () => {
    await createContactRow({ name: "Борис" });
    await born("Вера", 13, 11);
    await createContactRow({ name: "Анна" });

    expect(await upcoming()).toEqual(["Вера"]);
    expect((await listContacts(userA().id, "")).map((row) => row.name)).toEqual(["Анна", "Борис", "Вера"]);
  });

  it("Сортировка по дате: from the nearest birthday to the farthest", async () => {
    await born("Анна", 17, 11);
    await born("Иван", 12, 11);
    await born("Олег", 13, 11);

    expect(await upcoming()).toEqual(["Иван", "Олег", "Анна"]);
  });

  it("В один день: by name", async () => {
    // Олег is added first, so the order of adding cannot give the right answer by chance.
    await born("Олег", 14, 11);
    await born("Анна", 14, 11);

    expect(await upcoming()).toEqual(["Анна", "Олег"]);
  });

  it("Через новый год: on 28 December, 30 December comes before 2 January", async () => {
    await born("Анна", 2, 1);
    await born("Иван", 30, 12);

    expect(await upcoming({ today: { year: 2026, month: 12, day: 28 } })).toEqual(["Иван", "Анна"]);
  });

  it("Ни у кого нет дня рождения на неделе: an empty block", async () => {
    await born("Анна", 1, 1);
    await born("Иван", 11, 11);

    expect(await upcoming()).toEqual([]);
  });

  it("Идёт поиск: an empty block while a search is typed", async () => {
    await born("Анна", 13, 11);

    expect(await upcoming({ query: "Ан" })).toEqual([]);
    expect(await upcoming({ query: "" })).toEqual(["Анна"]);
  });

  it("В группе ни у кого: an empty block for the group, the full one for «Все»", async () => {
    const [family, , tennis] = await createGroups("Семья", "Друзья", "Теннис");
    const ivan = await born("Иван", 13, 11);
    await addToGroups(ivan.id, [family.id]);

    expect(await upcoming({ groupId: tennis.id })).toEqual([]);
    expect(await upcoming()).toEqual(["Иван"]);
  });
});
