import { describe, expect, it } from "vitest";

import { homeHref } from "@/lib/home-href";

describe("homeHref", () => {
  it("Переход к контактам группы: the address of the home page carries the group id", () => {
    expect(homeHref({ groupId: 4 })).toBe("/?group=4");
  });

  it("is the bare home page without a group", () => {
    expect(homeHref({})).toBe("/");
    expect(homeHref({ groupId: null })).toBe("/");
  });
});

describe("homeHref with a search", () => {
  it("Поиск в группе: the search address keeps the group", () => {
    expect(homeHref({ q: "ив", groupId: 4 })).toBe(`/?group=4&q=${encodeURIComponent("ив")}`);
  });

  it("Очистка поиска: an empty search leaves only the group", () => {
    expect(homeHref({ q: "", groupId: 4 })).toBe("/?group=4");
    expect(homeHref({ q: "   ", groupId: 4 })).toBe("/?group=4");
  });

  it("a search without a group", () => {
    expect(homeHref({ q: "ив пет" })).toBe(`/?q=${encodeURIComponent("ив пет")}`);
  });

  it("trims the search and escapes special characters", () => {
    expect(homeHref({ q: " а&б=в " })).toBe(`/?q=${encodeURIComponent("а&б=в")}`);
  });
});
