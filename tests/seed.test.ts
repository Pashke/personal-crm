import { count, eq, inArray } from "drizzle-orm";
import { describe, expect, it } from "vitest";

import { getDb } from "@/db";
import { contactGroups, contacts, groups, notes, users } from "@/db/schema";

import { seedDemoData } from "../scripts/demo-data";

import { userA } from "./setup/current-user";
import { createContactRow, createGroups, createGroupsOf, createUser } from "./setup/factories";

// openspec data-ownership, «Демо-данные у владельца»: what `pnpm db:seed` writes and for whom.
// A small count keeps the test fast; the script itself writes 1000 contacts.
const COUNT = 60;

async function contactCountOf(userId: string) {
  const [row] = await getDb().select({ value: count() }).from(contacts).where(eq(contacts.userId, userId));
  return row.value;
}

describe("demo data", () => {
  it("Демо-данные: contacts, notes and group memberships of the owner, in the owner's groups", async () => {
    const owner = userA();
    const ownGroups = await createGroups("Семья", "Друзья", "Знакомые", "Теннис", "Аналитики");
    const b = await createUser("user-b@example.com");
    const [groupOfB] = await createGroupsOf(b, "Чужая группа");

    expect(await seedDemoData(getDb(), { ownerEmail: owner.email, count: COUNT })).toMatchObject({
      contacts: COUNT,
    });

    expect(await contactCountOf(owner.id)).toBe(COUNT);
    expect(await contactCountOf(b.id)).toBe(0);
    const ownerContacts = getDb().select({ id: contacts.id }).from(contacts).where(eq(contacts.userId, owner.id));
    const [{ value: noteCount }] = await getDb()
      .select({ value: count() })
      .from(notes)
      .where(inArray(notes.contactId, ownerContacts));
    expect(noteCount).toBeGreaterThan(0);
    const memberships = await getDb().select().from(contactGroups);
    expect(memberships.length).toBeGreaterThan(0);
    const ownIds = new Set(ownGroups.map((group) => group.id));
    expect(memberships.every((link) => ownIds.has(link.groupId))).toBe(true);
    expect(memberships.some((link) => link.groupId === groupOfB.id)).toBe(false);
  });

  it("У владельца уже есть контакты: nothing is created", async () => {
    await createContactRow({ name: "Анна" });

    expect(await seedDemoData(getDb(), { ownerEmail: userA().email, count: COUNT })).toEqual({ skipped: 1 });

    expect(await getDb().select().from(contacts)).toHaveLength(1);
    expect(await getDb().select().from(notes)).toEqual([]);
  });

  it("another user's contacts do not stop the owner's demo data", async () => {
    const b = await createUser("user-b@example.com");
    await createContactRow({ name: "Борис", userId: b.id });

    await seedDemoData(getDb(), { ownerEmail: userA().email, count: COUNT });

    expect(await contactCountOf(userA().id)).toBe(COUNT);
    expect(await contactCountOf(b.id)).toBe(1);
  });

  it("an owner who never signed in becomes a user, with the address as the server keeps it", async () => {
    await seedDemoData(getDb(), { ownerEmail: " Owner@Example.COM ", count: COUNT });

    const [owner] = await getDb().select().from(users).where(eq(users.email, "owner@example.com"));
    expect(owner).toMatchObject({ email: "owner@example.com", emailVerified: true });
    expect(await contactCountOf(owner.id)).toBe(COUNT);
    // The owner has no groups yet, so nobody is in one.
    expect(await getDb().select().from(groups).where(eq(groups.userId, owner.id))).toEqual([]);
    expect(await getDb().select().from(contactGroups)).toEqual([]);
  });

  it("a wrong owner address is refused before anything is written", async () => {
    await expect(seedDemoData(getDb(), { ownerEmail: "owner@", count: COUNT })).rejects.toThrow("OWNER_EMAIL");
    await expect(seedDemoData(getDb(), { ownerEmail: undefined, count: COUNT })).rejects.toThrow("OWNER_EMAIL");

    expect(await getDb().select().from(contacts)).toEqual([]);
  });
});
