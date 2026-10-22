"use server";

import { and, eq, gt, sql } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { redirect, RedirectType } from "next/navigation";
import { z } from "zod";

import { getDb } from "@/db";
import { contacts, notes } from "@/db/schema";
import {
  contactSchema,
  noteSchema,
  type ContactField,
  type ContactFormState,
  type ContactValues,
  type DeleteContactState,
  type LogContactResult,
  type NoteFormState,
  type UndoContactLogResult,
} from "@/lib/contact-schema";
import { describeError, isForeignKeyViolation } from "@/lib/describe-error";

export async function createContact(
  _prevState: ContactFormState,
  formData: FormData,
): Promise<ContactFormState> {
  const values = readContactValues(formData);
  const parsed = contactSchema.safeParse(values);
  if (!parsed.success) {
    return { values, errors: firstErrors(parsed.error) };
  }

  let id: number;
  try {
    const [row] = await getDb()
      .insert(contacts)
      .values(toContactRow(parsed.data))
      .returning({ id: contacts.id });
    id = row.id;
  } catch (error) {
    console.error("Failed to create contact", { error: describeError(error) });
    return { values, message: "Не удалось сохранить контакт. Попробуйте ещё раз." };
  }

  revalidatePath("/");
  redirect(`/?added=${id}`);
}

export async function updateContact(
  id: number,
  _prevState: ContactFormState,
  formData: FormData,
): Promise<ContactFormState> {
  const values = readContactValues(formData);
  if (!isValidId(id)) {
    return { values, message: "Контакт не найден." };
  }
  const parsed = contactSchema.safeParse(values);
  if (!parsed.success) {
    return { values, errors: firstErrors(parsed.error) };
  }

  try {
    const updated = await getDb()
      .update(contacts)
      .set({ ...toContactRow(parsed.data), updatedAt: new Date() })
      .where(eq(contacts.id, id))
      .returning({ id: contacts.id });
    if (updated.length === 0) {
      return { values, message: "Контакт не найден — возможно, его удалили." };
    }
  } catch (error) {
    console.error("Failed to update contact", { id, error: describeError(error) });
    return { values, message: "Не удалось сохранить изменения. Попробуйте ещё раз." };
  }

  revalidatePath("/");
  revalidatePath(`/contacts/${id}`);
  redirect(`/contacts/${id}`);
}

export async function deleteContact(id: number): Promise<DeleteContactState> {
  if (!isValidId(id)) {
    return { error: "Контакт не найден." };
  }

  try {
    // Notes go with the contact: notes.contact_id is ON DELETE CASCADE.
    // Zero deleted rows means another tab got there first, which ends the same way.
    await getDb().delete(contacts).where(eq(contacts.id, id));
  } catch (error) {
    console.error("Failed to delete contact", { id, error: describeError(error) });
    return { error: "Не удалось удалить контакт. Попробуйте ещё раз." };
  }

  revalidatePath("/");
  revalidatePath(`/contacts/${id}`);
  // The name stays out of the URL: it would end up in the server's access logs.
  // Replace, so Back does not return to the page of a contact that no longer exists.
  redirect("/?deleted=1", RedirectType.replace);
}

export async function addNote(
  contactId: number,
  _prevState: NoteFormState,
  formData: FormData,
): Promise<NoteFormState> {
  const body = String(formData.get("body") ?? "");
  if (!isValidId(contactId)) {
    return { body, error: "Контакт не найден." };
  }
  const parsed = noteSchema.safeParse({ body });
  if (!parsed.success) {
    return { body, error: parsed.error.issues[0]?.message ?? "Проверьте текст заметки" };
  }

  try {
    await getDb().insert(notes).values({ contactId, body: parsed.data.body });
  } catch (error) {
    if (isForeignKeyViolation(error)) {
      return { body, error: "Контакт не найден — возможно, его удалили." };
    }
    console.error("Failed to add note", { contactId, error: describeError(error) });
    return { body, error: "Не удалось сохранить заметку. Попробуйте ещё раз." };
  }

  // The home page too: a new note can move the contact out of «Пора связаться».
  revalidatePath("/");
  revalidatePath(`/contacts/${contactId}`);
  return { savedAt: Date.now() };
}

// The text of a quick note saved from «Пора связаться» with an empty field.
const EMPTY_QUICK_NOTE = "Связались";

// A quick note from the «Пора связаться» block: a regular note, saved at this moment.
// Returns the note's id so the user can undo it right away.
export async function logContact(contactId: number, body: string): Promise<LogContactResult> {
  if (!isValidId(contactId)) {
    return { error: "Контакт не найден." };
  }
  if (typeof body !== "string") {
    return { error: "Проверьте текст заметки" };
  }
  const parsed = noteSchema.safeParse({ body: body.trim() || EMPTY_QUICK_NOTE });
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Проверьте текст заметки" };
  }

  let noteId: number;
  try {
    const [row] = await getDb()
      .insert(notes)
      .values({ contactId, body: parsed.data.body })
      .returning({ id: notes.id });
    noteId = row.id;
  } catch (error) {
    if (isForeignKeyViolation(error)) {
      return { error: "Контакт не найден — возможно, его удалили." };
    }
    console.error("Failed to log contact", { contactId, error: describeError(error) });
    return { error: "Не удалось сохранить заметку. Попробуйте ещё раз." };
  }

  revalidatePath("/");
  revalidatePath(`/contacts/${contactId}`);
  return { noteId };
}

// How long after a quick note «Отменить» still works on the server. The notice shows the
// button for 5 seconds; the rest is a margin for a slow network.
const UNDO_WINDOW_SECONDS = 60;

// «Отменить» after a quick note. Deletes only that note and only while it is fresh,
// so older notes can be deleted neither by a button nor by a forged request.
export async function undoContactLog(noteId: number): Promise<UndoContactLogResult> {
  if (!isValidId(noteId)) {
    return { error: "Отменить уже нельзя" };
  }

  let deleted: { contactId: number }[];
  try {
    deleted = await getDb()
      .delete(notes)
      .where(
        and(
          eq(notes.id, noteId),
          gt(notes.createdAt, sql`now() - make_interval(secs => ${UNDO_WINDOW_SECONDS})`),
        ),
      )
      .returning({ contactId: notes.contactId });
  } catch (error) {
    console.error("Failed to undo contact log", { noteId, error: describeError(error) });
    return { error: "Не удалось отменить. Попробуйте ещё раз." };
  }
  if (deleted.length === 0) {
    return { error: "Отменить уже нельзя" };
  }

  revalidatePath("/");
  revalidatePath(`/contacts/${deleted[0].contactId}`);
  return {};
}

function readContactValues(formData: FormData): ContactValues {
  const read = (key: ContactField) => String(formData.get(key) ?? "");
  const frequency = formData.get("contactFrequency");
  return {
    name: read("name"),
    howMet: read("howMet"),
    phone: read("phone"),
    email: read("email"),
    // No choice sent at all means "not set"; any other value is checked by the schema.
    contactFrequency: frequency === null ? undefined : String(frequency),
  };
}

// Empty optional fields are stored as NULL rather than empty strings, and so is "Не задано".
function toContactRow(data: z.output<typeof contactSchema>) {
  return {
    name: data.name,
    howMet: data.howMet || null,
    phone: data.phone || null,
    email: data.email || null,
    contactFrequency: data.contactFrequency === "none" ? null : data.contactFrequency,
  };
}

function firstErrors(error: z.ZodError<ContactValues>) {
  const fieldErrors = z.flattenError(error).fieldErrors;
  const result: Partial<Record<ContactField, string>> = {};
  for (const [field, messages] of Object.entries(fieldErrors)) {
    if (messages?.[0]) result[field as ContactField] = messages[0];
  }
  return result;
}

// Bound arguments come back from the browser, so they are checked like any other input.
function isValidId(id: unknown): id is number {
  return typeof id === "number" && Number.isInteger(id) && id > 0;
}
