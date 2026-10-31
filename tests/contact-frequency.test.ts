import { describe, expect, it } from "vitest";

import { createContact, updateContact } from "@/app/actions";
import { getDb } from "@/db";
import { contacts } from "@/db/schema";
import { emptyContactValues } from "@/lib/contact-schema";
import { getContact, listDueContacts } from "@/lib/contacts";

import { addNoteRow, contactRow, createContactRow } from "./setup/factories";
import { DAY_MS, daysAgo, formDataOf, redirectTarget } from "./setup/helpers";

const initial = { values: emptyContactValues };

async function createWith(fields: Record<string, string>) {
  const target = await redirectTarget(() => createContact(initial, formDataOf({ name: "Анна", ...fields })));
  return Number(target.replace("/?added=", ""));
}

async function updateWith(id: number, fields: Record<string, string>) {
  return redirectTarget(() => updateContact(id, initial, formDataOf({ name: "Анна", ...fields })));
}

const dueNames = async () => (await listDueContacts()).map((row) => row.name);

describe("contact frequency in the contact form", () => {
  it("Новый контакт с частотой: saved with «Раз в месяц»", async () => {
    const id = await createWith({ contactFrequency: "month" });

    expect((await contactRow(id)).contactFrequency).toBe("month");
  });

  it("Новый контакт без частоты: saved with «Не задано»", async () => {
    const id = await createWith({});

    expect((await contactRow(id)).contactFrequency).toBeNull();
  });

  it("Смена частоты: «Раз в месяц» → «Раз в неделю», the edit form reads the new value", async () => {
    const anna = await createContactRow({ name: "Анна", contactFrequency: "month" });

    expect(await updateWith(anna.id, { contactFrequency: "week" })).toBe(`/contacts/${anna.id}`);

    expect((await contactRow(anna.id)).contactFrequency).toBe("week");
  });

  it("Сброс частоты: «Не задано» is saved and the contact leaves «Пора связаться»", async () => {
    const anna = await createContactRow({ name: "Анна", contactFrequency: "week", createdAt: daysAgo(30) });
    expect(await dueNames()).toEqual(["Анна"]);

    await updateWith(anna.id, { contactFrequency: "none" });

    expect((await contactRow(anna.id)).contactFrequency).toBeNull();
    expect(await dueNames()).toEqual([]);
  });

  it("Смена частоты на более частую: due at once, the last contact does not move", async () => {
    const anna = await createContactRow({ name: "Анна", contactFrequency: "month", createdAt: daysAgo(100) });
    const note = await addNoteRow(anna.id, "Созвонились", daysAgo(20));
    expect(await dueNames()).toEqual([]);

    await updateWith(anna.id, { contactFrequency: "week" });

    const [due] = await listDueContacts();
    expect(due.name).toBe("Анна");
    expect(due.lastNoteAt).toEqual(note.createdAt);
    // The due date passed 13 days ago: 20 days since the note minus a week.
    expect(due.dueAt?.getTime()).toBe(note.createdAt.getTime() + 7 * DAY_MS);
    expect((await getContact(anna.id))?.lastNoteAt).toEqual(note.createdAt);
  });
});

describe("contact frequency checked on the server", () => {
  const forged = "раз в день";

  it("Подменённое значение: a new contact is not saved, the form keeps what was typed", async () => {
    const result = await createContact(
      initial,
      formDataOf({ name: "Анна Соколова", phone: "+7 900 123-45-67", contactFrequency: forged }),
    );

    expect(result.errors?.contactFrequency).toBe("Выберите один из вариантов");
    expect(result.values).toMatchObject({ name: "Анна Соколова", phone: "+7 900 123-45-67", contactFrequency: forged });
    expect(await getDb().select().from(contacts)).toEqual([]);
  });

  it("Подменённое значение: an edit is not saved, the contact stays as it was", async () => {
    const anna = await createContactRow({ name: "Анна", contactFrequency: "month" });
    const before = await contactRow(anna.id);

    const result = await updateContact(
      anna.id,
      initial,
      formDataOf({ name: "Анна Соколова", contactFrequency: forged }),
    );

    expect(result.errors?.contactFrequency).toBe("Выберите один из вариантов");
    expect(result.values).toMatchObject({ name: "Анна Соколова", contactFrequency: forged });
    expect(await contactRow(anna.id)).toEqual(before);
  });
});
