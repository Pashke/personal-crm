import { describe, expect, it } from "vitest";

import {
  countContacts,
  getContact,
  listContacts,
  listDueContacts,
  listDueContactsForHome,
  listNotes,
  listUpcomingBirthdaysForHome,
} from "@/lib/contacts";
import { listContactGroups, listGroups } from "@/lib/groups";

import { userA } from "./setup/current-user";
import { addNoteRow, addToGroups, createContactRow, createGroups, createGroupsOf, createUser } from "./setup/factories";
import { daysAgo } from "./setup/helpers";

// openspec data-ownership: every read shows only the signed-in user's records. A is the default
// user of a test, B is a second one.

const names = (rows: { name: string }[]) => rows.map((row) => row.name);

async function twoUsers() {
  const b = await createUser("user-b@example.com");
  return { a: userA(), b };
}

describe("only one's own contacts", () => {
  it("Чужой контакт не в списке: B does not see A's «Анна Соколова»", async () => {
    const { a, b } = await twoUsers();
    await createContactRow({ name: "Анна Соколова" });
    await createContactRow({ name: "Борис Иванов", userId: b.id });

    expect(names(await listContacts(b.id, ""))).toEqual(["Борис Иванов"]);
    expect(names(await listContacts(a.id, ""))).toEqual(["Анна Соколова"]);
  });

  it("Чужой контакт не находится поиском: B's search for «Соколова» finds nobody", async () => {
    const { b } = await twoUsers();
    await createContactRow({ name: "Анна Соколова" });

    expect(await listContacts(b.id, "Соколова")).toEqual([]);
  });

  it("Счётчик: B with 2 contacts sees «Найдено N из 2», whatever A has", async () => {
    const { a, b } = await twoUsers();
    for (const name of ["Анна", "Алла", "Вера"]) await createContactRow({ name });
    for (const name of ["Антон", "Глеб"]) await createContactRow({ name, userId: b.id });

    expect(await countContacts(b.id)).toBe(2);
    expect(await countContacts(a.id)).toBe(3);
    expect(names(await listContacts(b.id, "Ан"))).toEqual(["Антон"]);
  });

  it("Пора связаться: A's overdue contact is not in B's block", async () => {
    const { b } = await twoUsers();
    await createContactRow({ name: "Анна", contactFrequency: "week", createdAt: daysAgo(30) });
    await createContactRow({ name: "Борис", contactFrequency: "week", createdAt: daysAgo(20), userId: b.id });

    expect(names(await listDueContacts(b.id))).toEqual(["Борис"]);
    expect(names(await listDueContactsForHome(b.id, "", null))).toEqual(["Борис"]);
    expect(names(await listDueContacts(userA().id))).toEqual(["Анна"]);
  });

  it("Скоро день рождения: A's contact with a birthday tomorrow is not in B's block", async () => {
    const { a, b } = await twoUsers();
    const today = { year: 2026, month: 11, day: 12 };
    await createContactRow({ name: "Анна", birthDay: 13, birthMonth: 11 });
    await createContactRow({ name: "Борис", birthDay: 14, birthMonth: 11, userId: b.id });

    expect(names(await listUpcomingBirthdaysForHome(b.id, "", null, today))).toEqual(["Борис"]);
    expect(names(await listUpcomingBirthdaysForHome(a.id, "", null, today))).toEqual(["Анна"]);
  });

  it("A's contact, its notes and groups come back empty for B", async () => {
    const { a, b } = await twoUsers();
    const anna = await createContactRow({ name: "Анна Соколова" });
    await addNoteRow(anna.id, "Договорились созвониться");
    const [tennis] = await createGroups("Теннис");
    await addToGroups(anna.id, [tennis.id]);

    expect(await getContact(b.id, anna.id)).toBeNull();
    expect(await listNotes(b.id, anna.id)).toEqual([]);
    expect(await listContactGroups(b.id, anna.id)).toEqual([]);

    expect((await getContact(a.id, anna.id))?.name).toBe("Анна Соколова");
    expect(await listNotes(a.id, anna.id)).toHaveLength(1);
    expect(await listContactGroups(a.id, anna.id)).toEqual([tennis]);
  });
});

describe("only one's own groups", () => {
  it("Чужие группы не видны: A's «Теннис» is not among B's groups", async () => {
    const { a, b } = await twoUsers();
    await createGroups("Теннис");

    expect(await listGroups(b.id)).toEqual([]);
    expect(names(await listGroups(a.id))).toEqual(["Теннис"]);
  });

  it("the number of contacts in a group counts only the user's own contacts", async () => {
    const { b } = await twoUsers();
    const [friends] = await createGroupsOf(b, "Друзья");
    const boris = await createContactRow({ name: "Борис", userId: b.id });
    const anna = await createContactRow({ name: "Анна" });
    // Even if a link to someone else's contact got into the database, it would not count.
    await addToGroups(boris.id, [friends.id]);
    await addToGroups(anna.id, [friends.id]);

    expect(await listGroups(b.id)).toEqual([{ id: friends.id, name: "Друзья", contactCount: 1 }]);
    expect(names(await listContacts(b.id, "", friends.id))).toEqual(["Борис"]);
  });
});
