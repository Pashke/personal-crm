import { describe, expect, it } from "vitest";

import { createGroup } from "@/app/groups/actions";
import { listGroups } from "@/lib/groups";

import { allGroups, createGroups } from "./setup/factories";
import { formDataOf } from "./setup/helpers";

const defaultGroups = ["Семья", "Друзья", "Знакомые", "Теннис", "Аналитики"];

describe("createGroup", () => {
  it("Добавил группу / Новая группа в конце: the new group is last, without contacts", async () => {
    await createGroups(...defaultGroups);

    const result = await createGroup({}, formDataOf({ name: "Коллеги" }));

    expect(result.error).toBeUndefined();
    expect(result.savedAt).toEqual(expect.any(Number));
    const groups = await listGroups();
    expect(groups.map((group) => group.name)).toEqual([...defaultGroups, "Коллеги"]);
    expect(groups.at(-1)?.contactCount).toBe(0);
  });

  it("Пробелы по краям: saves the trimmed name", async () => {
    await createGroup({}, formDataOf({ name: "  Коллеги  " }));

    expect((await allGroups()).map((group) => group.name)).toEqual(["Коллеги"]);
  });

  it("Такая группа уже есть: a name that differs only in letter case is refused", async () => {
    await createGroups(...defaultGroups);

    const result = await createGroup({}, formDataOf({ name: "теннис" }));

    expect(result.error).toBe("Такая группа уже есть");
    expect(result.name).toBe("теннис");
    expect((await allGroups()).map((group) => group.name)).toEqual(defaultGroups);
  });

  it("Пустое название: the server refuses an empty name and one made of spaces", async () => {
    for (const name of ["", "   "]) {
      const result = await createGroup({}, formDataOf({ name }));
      expect(result.error).toBe("Укажите название группы");
    }
    expect(await allGroups()).toEqual([]);
  });

  it("Пустое название: a request without the field is refused as empty", async () => {
    const result = await createGroup({}, new FormData());

    expect(result.error).toBe("Укажите название группы");
  });

  it("Слишком длинное название: the server refuses 51 characters", async () => {
    const result = await createGroup({}, formDataOf({ name: "а".repeat(51) }));

    expect(result.error).toBe("Слишком длинное название");
    expect(await allGroups()).toEqual([]);
  });
});
