import { describe, expect, it } from "vitest";

import { logContact, undoContactLog } from "@/app/actions";
import { getContact, listDueContacts } from "@/lib/contacts";

import { addNoteRow, createContactRow, notesOf } from "./setup/factories";
import { DAY_MS, MINUTE_MS, daysAgo, msAgo } from "./setup/helpers";

const dueNames = async () => (await listDueContacts()).map((row) => row.name);

// Three overdue contacts, the most overdue first: Анна, Иван, Олег.
async function threeDue() {
  const anna = await createContactRow({ name: "Анна", contactFrequency: "week", createdAt: daysAgo(40) });
  const ivan = await createContactRow({ name: "Иван", contactFrequency: "week", createdAt: daysAgo(30) });
  await addNoteRow(ivan.id, "Встретились на кофе", daysAgo(20));
  const oleg = await createContactRow({ name: "Олег", contactFrequency: "week", createdAt: daysAgo(10) });
  return { anna, ivan, oleg };
}

// logContact answers with the new note's id; fails the test with the error otherwise.
async function logged(contactId: number, body: string) {
  const result = await logContact(contactId, body);
  if (result.error !== undefined) throw new Error(`Expected a saved note, got: ${result.error}`);
  return result.noteId;
}

describe("a quick note from «Пора связаться»", () => {
  it("С текстом: saved as a regular note, the contact leaves the block, the due date counts from it", async () => {
    const { ivan } = await threeDue();

    const noteId = await logged(ivan.id, "Созвонились, договорились о встрече");

    const notes = await notesOf(ivan.id);
    expect(notes.at(-1)).toMatchObject({ id: noteId, body: "Созвонились, договорились о встрече" });
    expect(await dueNames()).toEqual(["Анна", "Олег"]);
    const contact = (await getContact(ivan.id))!;
    expect(contact.lastNoteAt).toEqual(notes.at(-1)!.createdAt);
    expect(contact.dueAt!.getTime()).toBe(contact.lastNoteAt!.getTime() + 7 * DAY_MS);
  });

  it("Пустая заметка: saved as «Связались», the contact leaves the block", async () => {
    const { anna, ivan } = await threeDue();

    await logged(anna.id, "");
    await logged(ivan.id, "   \n ");

    expect((await notesOf(anna.id)).map((note) => note.body)).toEqual(["Связались"]);
    expect((await notesOf(ivan.id)).map((note) => note.body)).toEqual(["Встретились на кофе", "Связались"]);
    expect(await dueNames()).toEqual(["Олег"]);
  });

  it("Слишком длинная заметка: not saved, the contact stays in the block", async () => {
    const { anna } = await threeDue();

    const result = await logContact(anna.id, "а".repeat(10_001));

    expect(result.error).toBe("Слишком длинная заметка");
    expect(await notesOf(anna.id)).toEqual([]);
    expect(await dueNames()).toEqual(["Анна", "Иван", "Олег"]);
  });

  it("a note of exactly 10 000 characters is saved", async () => {
    const { anna } = await threeDue();

    await logged(anna.id, "а".repeat(10_000));

    expect(await notesOf(anna.id)).toHaveLength(1);
  });
});

describe("«Отменить» after a quick note", () => {
  it("Отменил: the note is gone, the contact is back in its place", async () => {
    const { ivan } = await threeDue();
    const noteId = await logged(ivan.id, "Созвонились");
    expect(await dueNames()).toEqual(["Анна", "Олег"]);

    expect(await undoContactLog(noteId)).toEqual({});

    expect((await notesOf(ivan.id)).map((note) => note.id)).not.toContain(noteId);
    expect(await dueNames()).toEqual(["Анна", "Иван", "Олег"]);
    // The due date counts from the previous note again.
    expect((await getContact(ivan.id))!.lastNoteAt!.getTime()).toBeLessThan(Date.now() - 19 * DAY_MS);
  });

  it("Другие заметки не трогаются: only the quick note is deleted", async () => {
    const { ivan } = await threeDue();
    const older = await notesOf(ivan.id);
    const noteId = await logged(ivan.id, "Созвонились");

    await undoContactLog(noteId);

    expect(await notesOf(ivan.id)).toEqual(older);
  });

  it("Не отменил: once the notice is gone the note can no longer be undone", async () => {
    const anna = await createContactRow({ name: "Анна", contactFrequency: "week", createdAt: daysAgo(40) });
    // The notice shows «Отменить» for 5 seconds; the server allows a minute for a slow network.
    const quick = await addNoteRow(anna.id, "Связались", msAgo(MINUTE_MS + 5000));

    expect(await undoContactLog(quick.id)).toEqual({ error: "Отменить уже нельзя" });

    expect(await notesOf(anna.id)).toEqual([quick]);
    expect(await dueNames()).toEqual([]);
  });

  it("Не отменил: an older note cannot be deleted by «Отменить» either", async () => {
    const anna = await createContactRow({ name: "Анна", contactFrequency: "week", createdAt: daysAgo(40) });
    const old = await addNoteRow(anna.id, "Созвонились", daysAgo(3));

    expect(await undoContactLog(old.id)).toEqual({ error: "Отменить уже нельзя" });
    expect(await undoContactLog(999)).toEqual({ error: "Отменить уже нельзя" });

    expect(await notesOf(anna.id)).toEqual([old]);
  });
});
