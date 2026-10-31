import { describe, expect, it } from "vitest";

import { addNote } from "@/app/actions";
import type { ContactFrequency } from "@/db/schema";
import { getContact, listDueContacts } from "@/lib/contacts";
import { formatDueStatus } from "@/lib/format";

import { addNoteRow, createContactRow } from "./setup/factories";
import { DAY_MS, MINUTE_MS, daysAgo, formDataOf, msAgo } from "./setup/helpers";

// Fixed moments are taken at noon UTC (18:00 where the spec names the hour), so the calendar
// day is the same in any time zone the database or the tests may run in.
const utc = (date: string, time = "12:00") => new Date(`${date}T${time}:00Z`);

async function contactWithNote(frequency: ContactFrequency, noteAt: Date) {
  const contact = await createContactRow({ name: "Анна", contactFrequency: frequency, createdAt: utc("2020-01-01") });
  await addNoteRow(contact.id, "Созвонились", noteAt);
  return (await getContact(contact.id))!;
}

describe("the moment of the last contact", () => {
  it("Есть заметки: the latest of three notes counts", async () => {
    const anna = await createContactRow({ name: "Анна", contactFrequency: "week", createdAt: utc("2026-08-01") });
    // Saved out of order on purpose: the latest moment wins, not the latest row.
    await addNoteRow(anna.id, "Встретились на кофе", utc("2026-09-20"));
    await addNoteRow(anna.id, "Поздравил с днём рождения", utc("2026-10-05"));
    await addNoteRow(anna.id, "Созвонились", utc("2026-09-01"));

    const contact = await getContact(anna.id);

    expect(contact?.lastNoteAt).toEqual(utc("2026-10-05"));
    expect(contact?.dueAt).toEqual(utc("2026-10-12"));
  });

  it("Заметок нет: the moment the contact was added counts", async () => {
    const anna = await createContactRow({ name: "Анна", contactFrequency: "month", createdAt: utc("2026-08-10") });

    const contact = await getContact(anna.id);

    expect(contact?.lastNoteAt).toBeNull();
    expect(contact?.dueAt).toEqual(utc("2026-09-10"));
  });

  it("Новая заметка запускает отсчёт заново: the due date counts from the new note", async () => {
    const anna = await createContactRow({ name: "Анна", contactFrequency: "week", createdAt: daysAgo(30) });
    expect((await getContact(anna.id))!.dueAt!.getTime()).toBeLessThan(Date.now());

    const before = Date.now();
    await addNote(anna.id, {}, formDataOf({ body: "Созвонились" }));
    const after = Date.now();

    const contact = (await getContact(anna.id))!;
    const noteAt = contact.lastNoteAt!.getTime();
    // The note is stamped by the database clock: allow a second of difference with ours.
    expect(noteAt).toBeGreaterThanOrEqual(before - 1000);
    expect(noteAt).toBeLessThanOrEqual(after + 1000);
    expect(contact.dueAt!.getTime()).toBe(noteAt + 7 * DAY_MS);
  });

  it("После новой заметки: an overdue contact's page shows the next due date at once", async () => {
    const anna = await createContactRow({ name: "Анна", contactFrequency: "week", createdAt: daysAgo(30) });
    const now = new Date();
    expect(formatDueStatus((await getContact(anna.id))!.dueAt!, now)).toBe("пора было 23 дня назад");

    await addNote(anna.id, {}, formDataOf({ body: "Созвонились" }));

    expect(formatDueStatus((await getContact(anna.id))!.dueAt!, new Date())).toMatch(/^следующий раз до /);
  });
});

describe("the due date", () => {
  it("Раз в неделю: a note on 1 October at 18:00 is due on 8 October at 18:00", async () => {
    const contact = await contactWithNote("week", utc("2026-10-01", "18:00"));

    expect(contact.dueAt).toEqual(utc("2026-10-08", "18:00"));
  });

  it("Раз в неделю: not due a minute before the due date, due a minute after it", async () => {
    const early = await createContactRow({ name: "Анна", contactFrequency: "week", createdAt: daysAgo(100) });
    await addNoteRow(early.id, "Созвонились", msAgo(7 * DAY_MS - MINUTE_MS));
    const late = await createContactRow({ name: "Иван", contactFrequency: "week", createdAt: daysAgo(100) });
    await addNoteRow(late.id, "Созвонились", msAgo(7 * DAY_MS + MINUTE_MS));

    expect((await listDueContacts()).map((row) => row.name)).toEqual(["Иван"]);
  });

  it("Конец месяца: 31 January plus a month is the last day of February", async () => {
    expect((await contactWithNote("month", utc("2027-01-31"))).dueAt).toEqual(utc("2027-02-28"));
  });

  it("Конец месяца: in a leap year it is 29 February", async () => {
    expect((await contactWithNote("month", utc("2028-01-31"))).dueAt).toEqual(utc("2028-02-29"));
  });

  it("a quarter is 3 calendar months, a year is 12", async () => {
    expect((await contactWithNote("quarter", utc("2026-10-15"))).dueAt).toEqual(utc("2027-01-15"));
    expect((await contactWithNote("quarter", utc("2026-11-30"))).dueAt).toEqual(utc("2027-02-28"));
    expect((await contactWithNote("year", utc("2026-10-20"))).dueAt).toEqual(utc("2027-10-20"));
    expect((await contactWithNote("year", utc("2028-02-29"))).dueAt).toEqual(utc("2029-02-28"));
  });
});
