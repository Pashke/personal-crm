import { describe, expect, it } from "vitest";

import { groupNameSchema } from "@/lib/group-schema";

describe("groupNameSchema", () => {
  it("Пробелы по краям: trims the name", () => {
    expect(groupNameSchema.parse("  Коллеги  ")).toBe("Коллеги");
  });

  it("Пустое название: empty and whitespace-only names are rejected", () => {
    for (const input of ["", "   "]) {
      const result = groupNameSchema.safeParse(input);
      expect(result.success).toBe(false);
      expect(result.error?.issues[0].message).toBe("Укажите название группы");
    }
  });

  it("Слишком длинное название: 51 characters are rejected, 50 are fine", () => {
    const tooLong = groupNameSchema.safeParse("а".repeat(51));
    expect(tooLong.success).toBe(false);
    expect(tooLong.error?.issues[0].message).toBe("Слишком длинное название");

    expect(groupNameSchema.safeParse("а".repeat(50)).success).toBe(true);
  });

  it("counts the length after trimming", () => {
    expect(groupNameSchema.safeParse(` ${"а".repeat(50)} `).success).toBe(true);
  });
});
