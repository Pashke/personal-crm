import { describe, expect, it } from "vitest";

import { emptyListText, formatContactsSummary } from "@/lib/format";

// Thousands are separated by a non-breaking space.
const nbsp = String.fromCharCode(160);

describe("formatContactsSummary", () => {
  it("Счётчик: «Найдено N из M» when a group is selected", () => {
    expect(formatContactsSummary({ found: 3, total: 1000, filtered: true })).toBe(`Найдено 3 из 1${nbsp}000`);
  });

  it("Счётчик: «Найдено N из M» during a search", () => {
    expect(formatContactsSummary({ found: 12, total: 1000, filtered: true })).toBe(`Найдено 12 из 1${nbsp}000`);
  });

  it("Счётчик: the plain total without a group and a search", () => {
    expect(formatContactsSummary({ found: 1000, total: 1000, filtered: false })).toBe(`1${nbsp}000 контактов`);
    expect(formatContactsSummary({ found: 1, total: 1, filtered: false })).toBe("1 контакт");
    expect(formatContactsSummary({ found: 0, total: 0, filtered: false })).toBe("0 контактов");
  });
});

describe("emptyListText", () => {
  it("Пустая группа: says nobody is in the group yet", () => {
    expect(emptyListText({ query: "", groupName: "Аналитики" })).toBe("В группе «Аналитики» пока никого нет");
  });

  it("Никого не нашлось: names the query and the group", () => {
    expect(emptyListText({ query: "ив", groupName: "Теннис" })).toBe(
      "Никого не нашлось по запросу «ив» в группе «Теннис»",
    );
  });

  it("Никого не нашлось: only the query without a group", () => {
    expect(emptyListText({ query: "ив", groupName: null })).toBe("Никого не нашлось по запросу «ив»");
  });

  it("has no text when there is nothing to explain (no contacts at all)", () => {
    expect(emptyListText({ query: "", groupName: null })).toBeNull();
  });
});
