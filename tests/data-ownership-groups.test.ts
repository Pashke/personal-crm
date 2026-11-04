import { describe, expect, it } from "vitest";

import { createContact } from "@/app/actions";
import { createGroup, deleteGroup, renameGroup } from "@/app/(app)/groups/actions";
import { emptyContactValues } from "@/lib/contact-schema";
import { listGroups } from "@/lib/groups";

import { signInAs, userA } from "./setup/current-user";
import { addToGroups, allGroups, createContactRow, createGroups, createUser, groupIdsOf } from "./setup/factories";
import { formDataOf, redirectTarget } from "./setup/helpers";

// openspec data-ownership and contact-groups: groups are per user. A is the default user of a test,
// B is a second one.

const initial = { values: emptyContactValues };

// Saves a new contact of the signed-in user the way the form does and returns its id.
async function createContactWith(fields: Record<string, string | string[]>) {
  const target = await redirectTarget(() => createContact(initial, formDataOf({ name: "Борис", ...fields })));
  return Number(target.replace("/?added=", ""));
}

async function signInB() {
  const b = await createUser("user-b@example.com");
  signInAs(b);
  return b;
}

const ownersOf = async () => (await allGroups()).map((group) => ({ name: group.name, userId: group.userId }));

describe("groups of one's own", () => {
  it("Новая группа из формы контакта: «Коллеги» belongs to the user who saved the contact", async () => {
    await createContactWith({ newGroups: "Коллеги" });

    expect(await ownersOf()).toEqual([{ name: "Коллеги", userId: userA().id }]);
  });

  it("Одинаковые названия: A and B each have their own «Друзья» with their own contacts", async () => {
    const [friendsOfA] = await createGroups("Друзья");
    const anna = await createContactRow({ name: "Анна" });
    await addToGroups(anna.id, [friendsOfA.id]);
    const b = await signInB();

    expect(await createGroup({}, formDataOf({ name: "Друзья" }))).toEqual({ savedAt: expect.any(Number) });
    await createContactWith({ groupIds: String((await listGroups(b.id))[0].id) });

    expect(await listGroups(userA().id)).toEqual([{ id: friendsOfA.id, name: "Друзья", contactCount: 1 }]);
    expect(await listGroups(b.id)).toEqual([{ id: expect.any(Number), name: "Друзья", contactCount: 1 }]);
  });

  it("Такая группа есть у другого пользователя: B's «Теннис» is created, A's stays as it was", async () => {
    await createGroups("Теннис");
    const b = await signInB();

    expect((await createGroup({}, formDataOf({ name: "Теннис" }))).error).toBeUndefined();

    expect(await ownersOf()).toEqual([
      { name: "Теннис", userId: userA().id },
      { name: "Теннис", userId: b.id },
    ]);
  });

  it("Такая группа уже есть: still refused within one user's groups", async () => {
    await createGroups("Теннис");
    await signInB();
    await createGroup({}, formDataOf({ name: "Теннис" }));

    expect(await createGroup({}, formDataOf({ name: "теннис" }))).toEqual({
      name: "теннис",
      error: "Такая группа уже есть",
    });
  });

  it("Название чужой группы: B's «Теннис» typed in the form is B's own, A's «Теннис» gets no contact", async () => {
    const [tennisOfA] = await createGroups("Теннис");
    const b = await signInB();

    const id = await createContactWith({ newGroups: "Теннис" });

    const [tennisOfB] = await listGroups(b.id);
    expect(tennisOfB).toMatchObject({ name: "Теннис", contactCount: 1 });
    expect(await groupIdsOf(id)).toEqual([tennisOfB.id]);
    expect(await listGroups(userA().id)).toEqual([{ id: tennisOfA.id, name: "Теннис", contactCount: 0 }]);
  });

  it("Чужая группа: the id of A's group in B's form is skipped, the other groups are kept", async () => {
    const [familyOfA] = await createGroups("Семья");
    const b = await signInB();
    await createGroup({}, formDataOf({ name: "Друзья" }));
    const [friendsOfB] = await listGroups(b.id);

    const id = await createContactWith({ groupIds: [String(familyOfA.id), String(friendsOfB.id)] });

    expect(await groupIdsOf(id)).toEqual([friendsOfB.id]);
  });

  it("Переименовать чужую группу: «Группа не найдена…», A's group keeps its name", async () => {
    const [tennisOfA] = await createGroups("Теннис");
    await signInB();

    expect(await renameGroup(tennisOfA.id, {}, formDataOf({ name: "Футбол" }))).toEqual({
      name: "Футбол",
      error: "Группа не найдена — возможно, её удалили.",
    });
    expect(await ownersOf()).toEqual([{ name: "Теннис", userId: userA().id }]);
  });

  it("Удалить чужую группу: no error, A's group and its contacts stay", async () => {
    const [tennisOfA] = await createGroups("Теннис");
    const anna = await createContactRow({ name: "Анна" });
    await addToGroups(anna.id, [tennisOfA.id]);
    await signInB();

    expect(await deleteGroup(tennisOfA.id)).toEqual({});

    expect(await listGroups(userA().id)).toEqual([{ id: tennisOfA.id, name: "Теннис", contactCount: 1 }]);
  });

  it("without signing in a group is neither renamed nor deleted", async () => {
    const [tennis] = await createGroups("Теннис");
    signInAs(null);

    expect(await redirectTarget(() => renameGroup(tennis.id, {}, formDataOf({ name: "Футбол" })))).toBe("/login");
    expect(await redirectTarget(() => deleteGroup(tennis.id))).toBe("/login");

    expect(await ownersOf()).toEqual([{ name: "Теннис", userId: userA().id }]);
  });
});
