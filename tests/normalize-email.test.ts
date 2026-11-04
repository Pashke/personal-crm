import { describe, expect, it } from "vitest";

import { normalizeEmail } from "@/db/email";

// openspec user-auth, «Проверка почты»: one function for the sign-in form, the owner's email
// in migrations and the demo data.
describe("normalizeEmail", () => {
  it("Пробелы и большие буквы: trims the edges and lowercases", () => {
    expect(normalizeEmail(" Anna@Example.COM ")).toBe("anna@example.com");
    expect(normalizeEmail("anna@example.com")).toBe("anna@example.com");
  });

  it("Неверный адрес: not an email", () => {
    expect(normalizeEmail("anna@")).toBeNull();
    expect(normalizeEmail("не почта")).toBeNull();
    expect(normalizeEmail("anna example.com")).toBeNull();
  });

  it("Пустое поле: empty or only spaces", () => {
    expect(normalizeEmail("")).toBeNull();
    expect(normalizeEmail("   ")).toBeNull();
  });

  it("an address longer than 254 characters is not an email", () => {
    const at254 = `${"a".repeat(64)}@${"b".repeat(185)}.com`;
    expect(at254).toHaveLength(254);
    expect(normalizeEmail(at254)).toBe(at254);
    expect(normalizeEmail(`a${at254}`)).toBeNull();
  });

  it("a value that is not text, as a forged request may send, is not an email", () => {
    expect(normalizeEmail(undefined)).toBeNull();
    expect(normalizeEmail(null)).toBeNull();
    expect(normalizeEmail(42)).toBeNull();
  });
});
