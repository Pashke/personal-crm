import { describe, expect, it } from "vitest";

import { ownerEmailSetting } from "@/db/owner-email";

// OWNER_EMAIL from .env reaches the owner migration as a connection setting (drizzle.config.ts).
describe("ownerEmailSetting", () => {
  it("passes the address as the server keeps it: trimmed and lowercase", () => {
    expect(ownerEmailSetting(" Owner@Example.com ")).toBe("-c crm.owner_email=owner@example.com");
  });

  it("no address: no setting, the migration itself decides whether it needs one", () => {
    expect(ownerEmailSetting(undefined)).toBeUndefined();
    expect(ownerEmailSetting("  ")).toBeUndefined();
  });

  it("Почта владельца не задана или неверная: a wrong address stops before the database is touched", () => {
    expect(() => ownerEmailSetting("owner@")).toThrow("OWNER_EMAIL");
    expect(() => ownerEmailSetting("owner@example.com -c search_path=evil")).toThrow("OWNER_EMAIL");
  });
});
