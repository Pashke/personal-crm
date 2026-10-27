import { describe, expect, it } from "vitest";

import { createContact, deleteContact, updateContact } from "@/app/actions";
import { deleteGroup } from "@/app/groups/actions";
import { emptyContactValues } from "@/lib/contact-schema";
import { listContacts } from "@/lib/contacts";
import { listContactGroups } from "@/lib/groups";

import { addToGroups, createContactRow, createGroups, groupIdsOf } from "./setup/factories";
import { formDataOf, redirectTarget } from "./setup/helpers";

const initial = { values: emptyContactValues };

// Saves a new contact the way the form does and returns its id (from /?added=<id>).
async function createWith(fields: Record<string, string | string[]>) {
  const target = await redirectTarget(() => createContact(initial, formDataOf({ name: "Анна", ...fields })));
  return Number(target.replace("/?added=", ""));
}

async function updateWith(id: number, fields: Record<string, string | string[]>) {
  return redirectTarget(() => updateContact(id, initial, formDataOf({ name: "Анна", ...fields })));
}

describe("contact groups in createContact", () => {
  it("Несколько групп: the contact is in every checked group", async () => {
    const [, friends, , tennis] = await createGroups("Семья", "Друзья", "Знакомые", "Теннис");

    const id = await createWith({ groupIds: [String(friends.id), String(tennis.id)] });

    expect(await listContactGroups(id)).toEqual([friends, tennis]);
  });

  it("Без групп: saved without groups and listed under «Все»", async () => {
    await createGroups("Семья");

    const id = await createWith({});

    expect(await groupIdsOf(id)).toEqual([]);
    expect((await listContacts("")).map((contact) => contact.id)).toContain(id);
  });

  it("a group checked twice is stored once", async () => {
    const [family] = await createGroups("Семья");

    const id = await createWith({ groupIds: [String(family.id), String(family.id)] });

    expect(await groupIdsOf(id)).toEqual([family.id]);
  });
});

describe("contact groups in updateContact", () => {
  it("Убрать из группы: unchecked group is dropped, the rest stay", async () => {
    const [family, , , tennis] = await createGroups("Семья", "Друзья", "Знакомые", "Теннис");
    const anna = await createContactRow({ name: "Анна" });
    await addToGroups(anna.id, [family.id, tennis.id]);

    await updateWith(anna.id, { groupIds: [String(family.id)] });

    expect(await groupIdsOf(anna.id)).toEqual([family.id]);
  });

  it("Форма показывает группы контакта: after saving, exactly the checked groups are stored", async () => {
    const [family, friends, , tennis] = await createGroups("Семья", "Друзья", "Знакомые", "Теннис");
    const anna = await createContactRow({ name: "Анна" });
    await addToGroups(anna.id, [family.id, friends.id]);

    await updateWith(anna.id, { groupIds: [String(tennis.id), String(family.id)] });

    expect(await listContactGroups(anna.id)).toEqual([family, tennis]);
  });

  it("no checked groups at all clears the contact's groups", async () => {
    const [family] = await createGroups("Семья");
    const anna = await createContactRow({ name: "Анна" });
    await addToGroups(anna.id, [family.id]);

    await updateWith(anna.id, {});

    expect(await groupIdsOf(anna.id)).toEqual([]);
  });

  it("does not touch the groups of a contact deleted in another tab", async () => {
    const [family] = await createGroups("Семья");
    const anna = await createContactRow({ name: "Анна" });
    await redirectTarget(() => deleteContact(anna.id));

    const result = await updateContact(anna.id, initial, formDataOf({ name: "Анна", groupIds: String(family.id) }));

    expect(result.message).toBe("Контакт не найден — возможно, его удалили.");
    expect(await groupIdsOf(anna.id)).toEqual([]);
  });
});

describe("checking groups on the server", () => {
  it("Группу удалили, пока открыта форма: saved with the remaining groups, no error", async () => {
    const [, friends, , tennis] = await createGroups("Семья", "Друзья", "Знакомые", "Теннис");
    const anna = await createContactRow({ name: "Анна" });
    const checked = [String(friends.id), String(tennis.id)];
    await deleteGroup(tennis.id);

    await updateWith(anna.id, { groupIds: checked });

    expect(await groupIdsOf(anna.id)).toEqual([friends.id]);
  });

  it("Подменённое значение: junk and unknown ids are skipped, real groups are kept", async () => {
    const [, friends] = await createGroups("Семья", "Друзья");

    const id = await createWith({
      groupIds: ["abc", "", "-1", "0", "1.5", "1e3", "99999", "0x10", " 1", String(friends.id)],
    });

    expect(await groupIdsOf(id)).toEqual([friends.id]);
  });
});
