import { describe, expect, it } from "vitest";

import { formatGroupContactCount, formatGroupNames, groupDeleteDescription } from "@/lib/format";

describe("formatGroupContactCount", () => {
  it("Число контактов: picks the right plural form", () => {
    expect(formatGroupContactCount(1)).toBe("1 контакт");
    expect(formatGroupContactCount(3)).toBe("3 контакта");
    expect(formatGroupContactCount(5)).toBe("5 контактов");
    expect(formatGroupContactCount(11)).toBe("11 контактов");
    expect(formatGroupContactCount(21)).toBe("21 контакт");
  });

  it("Число контактов: says «нет контактов» for an empty group", () => {
    expect(formatGroupContactCount(0)).toBe("нет контактов");
  });

  it("separates thousands", () => {
    expect(formatGroupContactCount(1000)).toBe(`1${String.fromCharCode(160)}000 контактов`);
  });
});

describe("formatGroupNames", () => {
  it("lists the names with commas, in the given order", () => {
    expect(formatGroupNames(["Друзья", "Теннис"])).toBe("Друзья, Теннис");
  });

  it("gives an empty string for no groups", () => {
    expect(formatGroupNames([])).toBe("");
  });
});

describe("groupDeleteDescription", () => {
  it("says contacts stay when the group has some", () => {
    expect(groupDeleteDescription("Теннис", 3)).toBe(
      "Группа «Теннис» будет удалена. Контакты из неё останутся — просто выйдут из группы.",
    );
  });

  it("says there are no contacts for an empty group", () => {
    expect(groupDeleteDescription("Теннис", 0)).toBe("Группа «Теннис» будет удалена. Контактов в ней нет.");
  });
});
