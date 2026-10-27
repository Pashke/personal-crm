import { describe, expect, it } from "vitest";

import { formatGroupNames } from "@/lib/format";
import { homeHref } from "@/lib/home-href";
import { listContactGroups } from "@/lib/groups";

import { addToGroups, createContactRow, createGroups } from "./setup/factories";

// The page of a contact shows these two values: the names in one line and a link per group.
describe("groups on the page of a contact", () => {
  it("Контакт в группах: «Семья, Теннис»", async () => {
    const [family, , tennis] = await createGroups("Семья", "Друзья", "Теннис");
    const anna = await createContactRow({ name: "Анна" });
    await addToGroups(anna.id, [tennis.id, family.id]);

    const groups = await listContactGroups(anna.id);

    expect(formatGroupNames(groups.map((group) => group.name))).toBe("Семья, Теннис");
  });

  it("Контакт без групп: nothing to show, the page prints a dash", async () => {
    await createGroups("Семья");
    const anna = await createContactRow({ name: "Анна" });

    expect(await listContactGroups(anna.id)).toEqual([]);
  });

  it("Переход к группе: each group links to the home page with that group selected", async () => {
    const [family, tennis] = await createGroups("Семья", "Теннис");
    const anna = await createContactRow({ name: "Анна" });
    await addToGroups(anna.id, [family.id, tennis.id]);

    const links = (await listContactGroups(anna.id)).map((group) => homeHref({ groupId: group.id }));

    expect(links).toEqual([`/?group=${family.id}`, `/?group=${tennis.id}`]);
  });
});
