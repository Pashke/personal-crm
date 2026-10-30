import { describe, expect, it } from "vitest";

import { createContact, updateContact } from "@/app/actions";
import { emptyContactValues } from "@/lib/contact-schema";
import { listContactGroups, listGroups } from "@/lib/groups";
import { getDb } from "@/db";
import { contacts } from "@/db/schema";

import { allGroups, createContactRow, createGroups, groupIdsOf } from "./setup/factories";
import { formDataOf, redirectTarget } from "./setup/helpers";

const initial = { values: emptyContactValues };
const defaultGroups = ["Семья", "Друзья", "Знакомые", "Теннис", "Аналитики"];

async function createWith(fields: Record<string, string | string[]>) {
  const target = await redirectTarget(() => createContact(initial, formDataOf({ name: "Анна", ...fields })));
  return Number(target.replace("/?added=", ""));
}

describe("new groups from the contact form", () => {
  it("Новая группа при сохранении: created last, the contact is in it", async () => {
    await createGroups(...defaultGroups);

    const id = await createWith({ newGroups: "Коллеги" });

    const groups = await listGroups();
    expect(groups.map((group) => group.name)).toEqual([...defaultGroups, "Коллеги"]);
    expect(await listContactGroups(id)).toEqual([{ id: groups[5].id, name: "Коллеги" }]);
  });

  it("Две новые группы: both are created and the contact is in both", async () => {
    await createGroups(...defaultGroups);

    const id = await createWith({ newGroups: ["Коллеги", "Соседи"] });

    expect((await allGroups()).map((group) => group.name)).toEqual([...defaultGroups, "Коллеги", "Соседи"]);
    expect((await listContactGroups(id)).map((group) => group.name)).toEqual(["Коллеги", "Соседи"]);
  });

  it("Название существующей группы: no new group, the contact joins the existing one", async () => {
    const created = await createGroups(...defaultGroups);

    const id = await createWith({ newGroups: "теннис" });

    expect((await allGroups()).map((group) => group.name)).toEqual(defaultGroups);
    expect(await groupIdsOf(id)).toEqual([created[3].id]);
  });

  it("works on update too, together with ticked groups", async () => {
    const created = await createGroups(...defaultGroups);
    const anna = await createContactRow({ name: "Анна" });

    await redirectTarget(() =>
      updateContact(
        anna.id,
        initial,
        formDataOf({ name: "Анна", groupIds: String(created[0].id), newGroups: ["Коллеги", "семья"] }),
      ),
    );

    expect((await listContactGroups(anna.id)).map((group) => group.name)).toEqual(["Семья", "Коллеги"]);
    expect(await allGroups()).toHaveLength(6);
  });

  it("a name typed twice (in any case) makes one group", async () => {
    await createWith({ newGroups: ["Коллеги", "коллеги"] });

    expect((await allGroups()).map((group) => group.name)).toEqual(["Коллеги"]);
  });

  it("trims the name of a new group", async () => {
    await createWith({ newGroups: "  Коллеги  " });

    expect((await allGroups()).map((group) => group.name)).toEqual(["Коллеги"]);
  });

  it("Неверное название: nothing is saved, the message is under the groups field", async () => {
    for (const bad of ["   ", "а".repeat(51)]) {
      const result = await createContact(initial, formDataOf({ name: "Анна", newGroups: ["Коллеги", bad] }));

      expect(result.errors?.newGroups).toBe(bad.trim() ? "Слишком длинное название" : "Укажите название группы");
    }
    expect(await getDb().select().from(contacts)).toEqual([]);
    expect(await allGroups()).toEqual([]);
  });

  it("Ошибка в другом поле: the answer returns the ticked and new groups, nothing is created", async () => {
    const [, friends] = await createGroups("Семья", "Друзья");

    const result = await createContact(
      initial,
      formDataOf({ name: "", groupIds: String(friends.id), newGroups: "Коллеги" }),
    );

    expect(result.errors?.name).toBe("Укажите имя");
    expect(result.values.groupIds).toEqual([String(friends.id)]);
    expect(result.values.newGroups).toEqual(["Коллеги"]);
    expect((await allGroups()).map((group) => group.name)).toEqual(["Семья", "Друзья"]);
    expect(await getDb().select().from(contacts)).toEqual([]);
  });
});
