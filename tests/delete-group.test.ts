import { describe, expect, it } from "vitest";

import { deleteGroup } from "@/app/groups/actions";
import { getDb } from "@/db";
import { contacts, notes } from "@/db/schema";
import { listContactGroups, listGroups } from "@/lib/groups";

import { addNoteRow, addToGroups, allGroups, createContactRow, createGroups } from "./setup/factories";

describe("deleteGroup", () => {
  it("Удалил группу: contacts stay with their data, notes and other groups", async () => {
    const [family, friends, , tennis] = await createGroups("Семья", "Друзья", "Знакомые", "Теннис");
    const anna = await createContactRow({ name: "Анна", howMet: "Однокурсница", phone: "+7 900 123-45-67" });
    const ivan = await createContactRow({ name: "Иван" });
    await addToGroups(anna.id, [family.id, tennis.id]);
    await addToGroups(ivan.id, [friends.id, tennis.id]);
    await addNoteRow(anna.id, "Созвонились");
    const contactsBefore = await getDb().select().from(contacts).orderBy(contacts.id);
    const notesBefore = await getDb().select().from(notes).orderBy(notes.id);

    const result = await deleteGroup(tennis.id);

    expect(result).toEqual({});
    expect((await allGroups()).map((group) => group.name)).toEqual(["Семья", "Друзья", "Знакомые"]);
    expect(await getDb().select().from(contacts).orderBy(contacts.id)).toEqual(contactsBefore);
    expect(await getDb().select().from(notes).orderBy(notes.id)).toEqual(notesBefore);
    expect(await listContactGroups(anna.id)).toEqual([{ id: family.id, name: "Семья" }]);
    expect(await listContactGroups(ivan.id)).toEqual([{ id: friends.id, name: "Друзья" }]);
    expect(await listGroups()).toEqual([
      { id: family.id, name: "Семья", contactCount: 1 },
      { id: friends.id, name: "Друзья", contactCount: 1 },
      expect.objectContaining({ name: "Знакомые", contactCount: 0 }),
    ]);
  });

  it("Группу уже удалили: no error when the group is already gone", async () => {
    const [family] = await createGroups("Семья");

    expect(await deleteGroup(family.id)).toEqual({});
    expect(await deleteGroup(family.id)).toEqual({});
    expect(await allGroups()).toEqual([]);
  });

  it("a forged id is answered as not found, nothing is deleted", async () => {
    await createGroups("Семья");

    for (const id of [0, -1, 1.5, Number.NaN]) {
      expect(await deleteGroup(id)).toEqual({ error: "Группа не найдена." });
    }
    expect(await allGroups()).toHaveLength(1);
  });
});
