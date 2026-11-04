import { describe, expect, it } from "vitest";

import { addNote, createContact, deleteContact, logContact, undoContactLog, updateContact } from "@/app/actions";
import { createGroup } from "@/app/(app)/groups/actions";
import { getDb } from "@/db";
import { contacts, groups, notes } from "@/db/schema";
import { emptyContactValues } from "@/lib/contact-schema";

import { signInAs, userA } from "./setup/current-user";
import { addNoteRow, contactRow, createContactRow, createUser, notesOf } from "./setup/factories";
import { formDataOf, redirectTarget } from "./setup/helpers";

// openspec data-ownership: a request with the id of someone else's contact answers as for a contact
// that does not exist, and changes nothing. A is the default user of a test, B is a second one.

const initial = { values: emptyContactValues };
const gone = "Контакт не найден — возможно, его удалили.";

// A's contact «Анна Соколова» with a note, and B signed in.
async function annaOfAAndBSignedIn() {
  const anna = await createContactRow({ name: "Анна Соколова", howMet: "Однокурсница", contactFrequency: "week" });
  const note = await addNoteRow(anna.id, "Договорились созвониться");
  const b = await createUser("user-b@example.com");
  signInAs(b);
  return { anna: await contactRow(anna.id), note, b };
}

describe("writing contacts", () => {
  it("Новый контакт: belongs to the user who added it", async () => {
    const target = await redirectTarget(() => createContact(initial, formDataOf({ name: "Анна Соколова" })));

    const [row] = await getDb().select().from(contacts);
    expect(target).toBe(`/?added=${row.id}`);
    expect(row.userId).toBe(userA().id);
  });

  it("Изменить чужой контакт: «Контакт не найден…», A's contact unchanged", async () => {
    const { anna } = await annaOfAAndBSignedIn();

    const state = await updateContact(anna.id, initial, formDataOf({ name: "Взломано" }));

    expect(state.message).toBe(gone);
    expect(await contactRow(anna.id)).toEqual(anna);
  });

  it("Удалить чужой контакт: the answer of a contact that is gone, A's contact and notes stay", async () => {
    const { anna, note } = await annaOfAAndBSignedIn();

    expect(await redirectTarget(() => deleteContact(anna.id))).toBe("/?deleted=1");

    expect(await contactRow(anna.id)).toEqual(anna);
    expect(await notesOf(anna.id)).toEqual([note]);
  });

  it("Заметка чужому контакту: «Контакт не найден…», no new note at A's contact", async () => {
    const { anna, note } = await annaOfAAndBSignedIn();

    expect(await addNote(anna.id, {}, formDataOf({ body: "Чужая заметка" }))).toEqual({
      body: "Чужая заметка",
      error: gone,
    });
    expect(await logContact(anna.id, "Быстрая чужая заметка")).toEqual({ error: gone });

    expect(await notesOf(anna.id)).toEqual([note]);
  });

  it("Отменить чужую быструю заметку: «Отменить уже нельзя», A's note stays", async () => {
    const anna = await createContactRow({ name: "Анна Соколова" });
    const logged = await logContact(anna.id, "Созвонились");
    if (logged.error !== undefined) throw new Error(logged.error);
    signInAs(await createUser("user-b@example.com"));

    expect(await undoContactLog(logged.noteId)).toEqual({ error: "Отменить уже нельзя" });

    expect((await notesOf(anna.id)).map((note) => note.id)).toEqual([logged.noteId]);
  });

  it("the owner can still change, note and undo their own contact", async () => {
    const anna = await createContactRow({ name: "Анна" });

    expect(await redirectTarget(() => updateContact(anna.id, initial, formDataOf({ name: "Анна С." })))).toBe(
      `/contacts/${anna.id}`,
    );
    expect((await addNote(anna.id, {}, formDataOf({ body: "Заметка" }))).error).toBeUndefined();
    const logged = await logContact(anna.id, "");
    if (logged.error !== undefined) throw new Error(logged.error);
    expect(await undoContactLog(logged.noteId)).toEqual({});

    expect((await contactRow(anna.id)).name).toBe("Анна С.");
    expect((await notesOf(anna.id)).map((note) => note.body)).toEqual(["Заметка"]);
  });
});

describe("Запрос к серверу без входа", () => {
  it("adding a contact, a note or a group saves nothing and sends to the sign-in page", async () => {
    const anna = await createContactRow({ name: "Анна" });
    signInAs(null);

    expect(await redirectTarget(() => createContact(initial, formDataOf({ name: "Иван" })))).toBe("/login");
    expect(await redirectTarget(() => addNote(anna.id, {}, formDataOf({ body: "Заметка" })))).toBe("/login");
    expect(await redirectTarget(() => logContact(anna.id, "Заметка"))).toBe("/login");
    expect(await redirectTarget(() => createGroup({}, formDataOf({ name: "Коллеги" })))).toBe("/login");

    expect((await getDb().select().from(contacts)).map((row) => row.name)).toEqual(["Анна"]);
    expect(await getDb().select().from(notes)).toEqual([]);
    expect(await getDb().select().from(groups)).toEqual([]);
  });

  it("changing or deleting saves nothing and sends to the sign-in page", async () => {
    const anna = await createContactRow({ name: "Анна" });
    const note = await addNoteRow(anna.id, "Созвонились");
    signInAs(null);

    expect(await redirectTarget(() => updateContact(anna.id, initial, formDataOf({ name: "Иван" })))).toBe("/login");
    expect(await redirectTarget(() => deleteContact(anna.id))).toBe("/login");
    expect(await redirectTarget(() => undoContactLog(note.id))).toBe("/login");

    expect((await contactRow(anna.id)).name).toBe("Анна");
    expect(await notesOf(anna.id)).toEqual([note]);
  });
});
