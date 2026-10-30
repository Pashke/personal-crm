import { describe, expect, it } from "vitest";

import { addPendingGroup } from "@/lib/pending-group";

const groups = [
  { id: 1, name: "Семья" },
  { id: 4, name: "Теннис" },
];

describe("addPendingGroup", () => {
  it("Новая группа: a new name is added to the pending list", () => {
    expect(addPendingGroup("Коллеги", groups, [])).toEqual({ pending: ["Коллеги"], checkGroupId: null });
  });

  it("keeps the order of pending groups and trims the name", () => {
    expect(addPendingGroup("  Соседи ", groups, ["Коллеги"])).toEqual({
      pending: ["Коллеги", "Соседи"],
      checkGroupId: null,
    });
  });

  it("Название существующей группы: a name of an existing group (any case) ticks that group", () => {
    expect(addPendingGroup("теннис", groups, ["Коллеги"])).toEqual({
      pending: ["Коллеги"],
      checkGroupId: 4,
    });
  });

  it("a repeat of an already added name changes nothing, even in another case", () => {
    expect(addPendingGroup("коллеги", groups, ["Коллеги"])).toEqual({
      pending: ["Коллеги"],
      checkGroupId: null,
    });
  });

  it("Неверное название: empty names get the same message as on the page «Группы»", () => {
    expect(addPendingGroup("", groups, [])).toEqual({ error: "Укажите название группы" });
    expect(addPendingGroup("   ", groups, [])).toEqual({ error: "Укажите название группы" });
  });

  it("Неверное название: a name over 50 characters gets the same message", () => {
    expect(addPendingGroup("а".repeat(51), groups, [])).toEqual({ error: "Слишком длинное название" });
  });
});
