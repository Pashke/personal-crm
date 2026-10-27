import { describe, expect, it } from "vitest";

import { createContact } from "@/app/actions";
import { getDb } from "@/db";
import { contacts } from "@/db/schema";
import { emptyContactValues } from "@/lib/contact-schema";

import { formDataOf, redirectTarget } from "./setup/helpers";

describe("createContact", () => {
  it("saves the contact and redirects to /?added=<id>", async () => {
    const target = await redirectTarget(() =>
      createContact({ values: emptyContactValues }, formDataOf({ name: "Анна Соколова" })),
    );

    const rows = await getDb().select().from(contacts);
    expect(rows).toHaveLength(1);
    expect(rows[0].name).toBe("Анна Соколова");
    expect(target).toBe(`/?added=${rows[0].id}`);
  });
});
