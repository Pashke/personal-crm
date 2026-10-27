import { describe, expect, it } from "vitest";

import { resolveSelectedGroup } from "@/lib/selected-group";

const groups = [{ id: 1 }, { id: 4 }];

describe("resolveSelectedGroup", () => {
  it("Сохранённая ссылка: the id of an existing group is selected", () => {
    expect(resolveSelectedGroup("4", groups)).toBe(4);
  });

  it("Группы больше нет: an id without a group means «Все»", () => {
    expect(resolveSelectedGroup("7", groups)).toBeNull();
    expect(resolveSelectedGroup("4", [])).toBeNull();
  });

  it("junk in the address means «Все»", () => {
    for (const junk of ["", "abc", "-1", "0", "1.5", "1e3", " 4", "4 ", "99999999999", "0x4"]) {
      expect(resolveSelectedGroup(junk, groups)).toBeNull();
    }
  });

  it("no parameter, or a repeated one, means «Все»", () => {
    expect(resolveSelectedGroup(undefined, groups)).toBeNull();
    expect(resolveSelectedGroup(["1", "4"], groups)).toBeNull();
  });
});
