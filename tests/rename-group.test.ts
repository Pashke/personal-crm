import { describe, expect, it } from "vitest";

import { renameGroup } from "@/app/groups/actions";
import { listGroups } from "@/lib/groups";

import { addToGroups, allGroups, createContactRow, createGroups } from "./setup/factories";
import { formDataOf } from "./setup/helpers";

const defaultGroups = ["Семья", "Друзья", "Знакомые", "Теннис", "Аналитики"];

describe("renameGroup", () => {
  it("Переименовал: new name, same contacts, same place in the order", async () => {
    const created = await createGroups(...defaultGroups);
    const analytics = created[4];
    const anna = await createContactRow({ name: "Анна" });
    await addToGroups(anna.id, [analytics.id]);

    const result = await renameGroup(analytics.id, {}, formDataOf({ name: "Аналитика" }));

    expect(result.error).toBeUndefined();
    expect(result.savedAt).toEqual(expect.any(Number));
    expect(await listGroups()).toEqual([
      ...created.slice(0, 4).map((group) => ({ ...group, contactCount: 0 })),
      { id: analytics.id, name: "Аналитика", contactCount: 1 },
    ]);
  });

  it("Занятое название: a name taken by another group (any letter case) is refused", async () => {
    const created = await createGroups(...defaultGroups);

    const result = await renameGroup(created[2].id, {}, formDataOf({ name: "друзья" }));

    expect(result.error).toBe("Такая группа уже есть");
    expect(result.name).toBe("друзья");
    expect((await allGroups()).map((group) => group.name)).toEqual(defaultGroups);
  });

  it("Только регистр: the group may change only the case of its own name", async () => {
    const created = await createGroups(...defaultGroups);

    const result = await renameGroup(created[3].id, {}, formDataOf({ name: "ТЕННИС" }));

    expect(result.error).toBeUndefined();
    expect((await allGroups()).map((group) => group.name)).toEqual([
      "Семья",
      "Друзья",
      "Знакомые",
      "ТЕННИС",
      "Аналитики",
    ]);
  });

  it("Группу уже удалили: says the group is not found", async () => {
    const result = await renameGroup(999, {}, formDataOf({ name: "Коллеги" }));

    expect(result.error).toBe("Группа не найдена — возможно, её удалили.");
  });

  it("a forged id is answered as not found", async () => {
    await createGroups("Семья");

    for (const id of [0, -1, 1.5, Number.NaN]) {
      const result = await renameGroup(id, {}, formDataOf({ name: "Коллеги" }));
      expect(result.error).toBe("Группа не найдена.");
    }
    expect((await allGroups()).map((group) => group.name)).toEqual(["Семья"]);
  });

  it("checks the name like at creation: trims it, refuses empty and too long", async () => {
    const [family] = await createGroups("Семья");

    expect((await renameGroup(family.id, {}, formDataOf({ name: "  Родные  " }))).error).toBeUndefined();
    expect((await allGroups())[0].name).toBe("Родные");

    expect((await renameGroup(family.id, {}, formDataOf({ name: "   " }))).error).toBe("Укажите название группы");
    expect((await renameGroup(family.id, {}, formDataOf({ name: "а".repeat(51) }))).error).toBe(
      "Слишком длинное название",
    );
    expect((await allGroups())[0].name).toBe("Родные");
  });
});
