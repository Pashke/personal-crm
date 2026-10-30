import { eq } from "drizzle-orm";
import { beforeEach, describe, expect, it } from "vitest";

import { getDb } from "@/db";
import { groups } from "@/db/schema";
import { listContacts } from "@/lib/contacts";

import { addToGroups, createContactRow, createGroups } from "./setup/factories";

const names = async (query: string, groupId?: number | null) =>
  (await listContacts(query, groupId)).map((contact) => contact.name);

let family: { id: number; name: string };
let friends: { id: number; name: string };
let tennis: { id: number; name: string };
let analytics: { id: number; name: string };

// Анна — «Друзья» и «Теннис»; Иван — «Семья»; Борис (в «Теннис») и Вера — без групп у Веры.
beforeEach(async () => {
  [family, friends, tennis, analytics] = await createGroups("Семья", "Друзья", "Теннис", "Аналитики");
  const anna = await createContactRow({ name: "Анна Соколова" });
  const ivan = await createContactRow({ name: "Иван Петров" });
  const boris = await createContactRow({ name: "Борис Иванов" });
  await createContactRow({ name: "Вера Орлова" });
  await addToGroups(anna.id, [friends.id, tennis.id]);
  await addToGroups(ivan.id, [family.id]);
  await addToGroups(boris.id, [tennis.id]);
});

describe("listContacts with a group", () => {
  it("Выбор группы: only the group's contacts, by name", async () => {
    expect(await names("", tennis.id)).toEqual(["Анна Соколова", "Борис Иванов"]);
  });

  it("Все: without a group every contact is listed", async () => {
    const all = ["Анна Соколова", "Борис Иванов", "Вера Орлова", "Иван Петров"];
    expect(await names("")).toEqual(all);
    expect(await names("", null)).toEqual(all);
  });

  it("Контакт в двух группах: seen under both", async () => {
    expect(await names("", friends.id)).toContain("Анна Соколова");
    expect(await names("", tennis.id)).toContain("Анна Соколова");
  });

  it("Пустая группа: an empty list", async () => {
    expect(await names("", analytics.id)).toEqual([]);
  });

  it("Поиск в группе: the search looks only inside the group", async () => {
    // «ив» is in Иван Петров and Борис Иванов; only Борис is in «Теннис».
    expect(await names("ив", tennis.id)).toEqual(["Борис Иванов"]);
    expect(await names("ив")).toEqual(["Борис Иванов", "Иван Петров"]);
  });

  it("Очистка поиска: an empty query gives the whole group again", async () => {
    expect(await names("ив", tennis.id)).toHaveLength(1);
    expect(await names("   ", tennis.id)).toEqual(["Анна Соколова", "Борис Иванов"]);
  });

  it("a group that does not exist gives an empty list", async () => {
    expect(await names("", 99999)).toEqual([]);
  });
});

describe("groups in the row", () => {
  const groupsOf = async (name: string) => {
    const row = (await listContacts("")).find((contact) => contact.name === name);
    return row?.groups;
  };

  it("Контакт в группах: names in the common order", async () => {
    expect(await groupsOf("Анна Соколова")).toEqual(["Друзья", "Теннис"]);
  });

  it("Контакт без групп: an empty list", async () => {
    expect(await groupsOf("Вера Орлова")).toEqual([]);
  });

  it("shows the new name after the group is renamed", async () => {
    await getDb().update(groups).set({ name: "Спорт" }).where(eq(groups.id, tennis.id));

    expect(await groupsOf("Анна Соколова")).toEqual(["Друзья", "Спорт"]);
  });

  it("each row has its own groups when the list is filtered", async () => {
    const rows = await listContacts("", tennis.id);

    expect(rows.map((row) => row.groups)).toEqual([["Друзья", "Теннис"], ["Теннис"]]);
  });
});
