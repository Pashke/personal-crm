import { expect, test } from "vitest";

// Deliberately failing: proves that a red CI blocks the merge into main. Never to be merged.
test("branch protection check", () => {
  expect(1).toBe(2);
});
