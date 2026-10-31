import { describe, expect, it } from "vitest";

import { addNote, deleteContact } from "@/app/actions";
import { listContacts, listDueContacts, listDueContactsForHome } from "@/lib/contacts";

import { addNoteRow, addToGroups, createContactRow, createGroups } from "./setup/factories";
import { DAY_MS, MINUTE_MS, daysAgo, formDataOf, msAgo, redirectTarget } from "./setup/helpers";

const dueNames = async (groupId?: number | null) => (await listDueContacts(groupId)).map((row) => row.name);

describe("listDueContacts", () => {
  it("Срок наступил: weekly contact, last note 10 days ago", async () => {
    const anna = await createContactRow({ name: "Анна", contactFrequency: "week", createdAt: daysAgo(100) });
    await addNoteRow(anna.id, "Созвонились", daysAgo(10));

    expect(await dueNames()).toEqual(["Анна"]);
  });

  it("Срок ещё не наступил: monthly contact, last note 10 days ago", async () => {
    const anna = await createContactRow({ name: "Анна", contactFrequency: "month", createdAt: daysAgo(100) });
    await addNoteRow(anna.id, "Созвонились", daysAgo(10));

    expect(await dueNames()).toEqual([]);
  });

  it("Частота не задана: no frequency, no notes for a year", async () => {
    await createContactRow({ name: "Анна", createdAt: daysAgo(400) });

    expect(await dueNames()).toEqual([]);
  });

  it("Написал заметку — контакт ушёл из блока", async () => {
    const anna = await createContactRow({ name: "Анна", contactFrequency: "week", createdAt: daysAgo(30) });
    expect(await dueNames()).toEqual(["Анна"]);

    await addNote(anna.id, {}, formDataOf({ body: "Созвонились" }));

    expect(await dueNames()).toEqual([]);
  });

  it("Удалённый контакт: gone from the block and from the list", async () => {
    const anna = await createContactRow({ name: "Анна", contactFrequency: "week", createdAt: daysAgo(30) });

    await redirectTarget(() => deleteContact(anna.id));

    expect(await dueNames()).toEqual([]);
    expect(await listContacts("")).toEqual([]);
  });

  it("Общий список не меняется: a contact from the block keeps its place in the list", async () => {
    await createContactRow({ name: "Борис" });
    await createContactRow({ name: "Анна", contactFrequency: "week", createdAt: daysAgo(30) });
    await createContactRow({ name: "Вера" });

    expect(await dueNames()).toEqual(["Анна"]);
    expect((await listContacts("")).map((row) => row.name)).toEqual(["Анна", "Борис", "Вера"]);
  });

  it("Никому не пора: an empty block", async () => {
    await createContactRow({ name: "Анна", contactFrequency: "month" });

    expect(await dueNames()).toEqual([]);
  });

  it("the most overdue come first", async () => {
    await createContactRow({ name: "Борис", contactFrequency: "week", createdAt: daysAgo(10) });
    await createContactRow({ name: "Анна", contactFrequency: "week", createdAt: daysAgo(60) });

    expect(await dueNames()).toEqual(["Анна", "Борис"]);
  });

  it("Сортировка по сроку: by the due date, whatever the frequency and the last contact", async () => {
    // The spec's people with their names swapped, so the alphabet cannot give the right order
    // by chance. By the last contact the order would be the reverse one.
    const oleg = await createContactRow({ name: "Олег", contactFrequency: "week", createdAt: daysAgo(500) });
    await addNoteRow(oleg.id, "Созвонились", daysAgo(19)); // due 12 days ago
    const ivan = await createContactRow({ name: "Иван", contactFrequency: "month", createdAt: daysAgo(500) });
    await addNoteRow(ivan.id, "Созвонились", daysAgo(33)); // due 2–5 days ago, by the month's length
    const anna = await createContactRow({ name: "Анна", contactFrequency: "year", createdAt: daysAgo(500) });
    await addNoteRow(anna.id, "Созвонились", msAgo(366 * DAY_MS + 60 * MINUTE_MS)); // due today or a day ago

    expect(await dueNames()).toEqual(["Олег", "Иван", "Анна"]);
  });

  it("Сортировка по сроку: the same due date goes by name", async () => {
    const created = daysAgo(30);
    await createContactRow({ name: "Борис", contactFrequency: "week", createdAt: created });
    await createContactRow({ name: "Анна", contactFrequency: "week", createdAt: created });

    expect(await dueNames()).toEqual(["Анна", "Борис"]);
  });
});

describe("listDueContacts with a group", () => {
  it("Выбрана группа: only the group's contacts, and «Все» brings the rest back", async () => {
    const [family, , tennis] = await createGroups("Семья", "Друзья", "Теннис");
    const created = daysAgo(30);
    const anna = await createContactRow({ name: "Анна", contactFrequency: "week", createdAt: created });
    const ivan = await createContactRow({ name: "Иван", contactFrequency: "week", createdAt: created });
    await addToGroups(anna.id, [tennis.id]);
    await addToGroups(ivan.id, [family.id]);

    expect(await dueNames(tennis.id)).toEqual(["Анна"]);
    expect(await dueNames(null)).toEqual(["Анна", "Иван"]);
    expect(await dueNames()).toEqual(["Анна", "Иван"]);
  });

  it("Контакт в нескольких группах: in the block under each of them", async () => {
    const [, friends, tennis] = await createGroups("Семья", "Друзья", "Теннис");
    const anna = await createContactRow({ name: "Анна", contactFrequency: "week", createdAt: daysAgo(30) });
    await addToGroups(anna.id, [friends.id, tennis.id]);

    expect(await dueNames(friends.id)).toEqual(["Анна"]);
    expect(await dueNames(tennis.id)).toEqual(["Анна"]);
  });

  it("В группе никому не пора: an empty block for the group, the full one for «Все»", async () => {
    const [family, , tennis] = await createGroups("Семья", "Друзья", "Теннис");
    // The same moment for both, so only the name decides their order.
    const created = daysAgo(30);
    const ivan = await createContactRow({ name: "Иван", contactFrequency: "week", createdAt: created });
    await addToGroups(ivan.id, [family.id]);
    // A due contact outside every group does not leak into a group either.
    await createContactRow({ name: "Вера", contactFrequency: "week", createdAt: created });

    expect(await dueNames(tennis.id)).toEqual([]);
    expect(await dueNames()).toEqual(["Вера", "Иван"]);
  });
});

describe("listDueContactsForHome", () => {
  it("Идёт поиск: the block is not requested while a search is typed", async () => {
    await createContactRow({ name: "Анна", contactFrequency: "week", createdAt: daysAgo(30) });

    expect((await listDueContactsForHome("", null)).map((row) => row.name)).toEqual(["Анна"]);
    expect(await listDueContactsForHome("Ан", null)).toEqual([]);
  });

  it("passes the group on", async () => {
    const [family] = await createGroups("Семья");
    await createContactRow({ name: "Анна", contactFrequency: "week", createdAt: daysAgo(30) });

    expect(await listDueContactsForHome("", family.id)).toEqual([]);
  });
});
