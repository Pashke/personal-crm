import { eq } from "drizzle-orm";
import { describe, expect, it } from "vitest";

import { deleteContact } from "@/app/actions";
import { getDb } from "@/db";
import { groups } from "@/db/schema";
import { listContactGroups, listGroups } from "@/lib/groups";

import { addToGroups, createContactRow, createGroups } from "./setup/factories";
import { redirectTarget } from "./setup/helpers";

describe("listGroups", () => {
  it("returns groups in the order of creation with the number of contacts in each", async () => {
    const [family, friends, tennis] = await createGroups("Семья", "Друзья", "Теннис");
    const anna = await createContactRow({ name: "Анна" });
    const ivan = await createContactRow({ name: "Иван" });
    await addToGroups(anna.id, [family.id, tennis.id]);
    await addToGroups(ivan.id, [tennis.id]);

    expect(await listGroups()).toEqual([
      { id: family.id, name: "Семья", contactCount: 1 },
      { id: friends.id, name: "Друзья", contactCount: 0 },
      { id: tennis.id, name: "Теннис", contactCount: 2 },
    ]);
  });

  it("returns an empty list when there are no groups", async () => {
    expect(await listGroups()).toEqual([]);
  });

  it("Удалённый контакт: groups stay, each has one contact less", async () => {
    const [family, tennis] = await createGroups("Семья", "Теннис");
    const anna = await createContactRow({ name: "Анна" });
    const ivan = await createContactRow({ name: "Иван" });
    await addToGroups(anna.id, [family.id, tennis.id]);
    await addToGroups(ivan.id, [family.id, tennis.id]);

    await redirectTarget(() => deleteContact(anna.id));

    expect(await listGroups()).toEqual([
      { id: family.id, name: "Семья", contactCount: 1 },
      { id: tennis.id, name: "Теннис", contactCount: 1 },
    ]);
  });
});

describe("listContactGroups", () => {
  it("Порядок у контакта: groups go in the common order, not in the order they were set", async () => {
    const [family, , tennis] = await createGroups("Семья", "Друзья", "Теннис");
    const anna = await createContactRow({ name: "Анна" });
    await addToGroups(anna.id, [tennis.id]);
    await addToGroups(anna.id, [family.id]);

    expect(await listContactGroups(anna.id)).toEqual([
      { id: family.id, name: "Семья" },
      { id: tennis.id, name: "Теннис" },
    ]);
  });

  it("returns an empty list for a contact without groups", async () => {
    await createGroups("Семья");
    const anna = await createContactRow({ name: "Анна" });

    expect(await listContactGroups(anna.id)).toEqual([]);
  });

  it("shows the new name after a group is renamed", async () => {
    // Renaming itself is covered with the page «Группы»; here only that the name is read live.
    const [family] = await createGroups("Семья");
    const anna = await createContactRow({ name: "Анна" });
    await addToGroups(anna.id, [family.id]);

    await getDb().update(groups).set({ name: "Родные" }).where(eq(groups.id, family.id));

    expect(await listContactGroups(anna.id)).toEqual([{ id: family.id, name: "Родные" }]);
  });
});
