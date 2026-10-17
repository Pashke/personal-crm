"use server";

import { eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";

import { getDb } from "@/db";
import { contacts, notes } from "@/db/schema";
import {
  contactSchema,
  noteSchema,
  type ContactField,
  type ContactFormState,
  type ContactValues,
  type NoteFormState,
} from "@/lib/contact-schema";

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
    console.error("Failed to create contact", error);
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
    console.error("Failed to update contact", { id, error });
    return { values, message: "Не удалось сохранить изменения. Попробуйте ещё раз." };
  }

  revalidatePath("/");
  revalidatePath(`/contacts/${id}`);
  redirect(`/contacts/${id}`);
}

export async function addNote(
  contactId: number,
  _prevState: NoteFormState,
  formData: FormData,
): Promise<NoteFormState> {
  if (!isValidId(contactId)) {
    return { error: "Контакт не найден." };
  }
  const parsed = noteSchema.safeParse({ body: String(formData.get("body") ?? "") });
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Проверьте текст заметки" };
  }

  try {
    await getDb().insert(notes).values({ contactId, body: parsed.data.body });
  } catch (error) {
    console.error("Failed to add note", { contactId, error });
    return { error: "Не удалось сохранить заметку. Попробуйте ещё раз." };
  }

  revalidatePath(`/contacts/${contactId}`);
  return { savedAt: Date.now() };
}

function readContactValues(formData: FormData): ContactValues {
  const read = (key: ContactField) => String(formData.get(key) ?? "");
  return { name: read("name"), howMet: read("howMet"), phone: read("phone"), email: read("email") };
}

// Empty optional fields are stored as NULL rather than empty strings.
function toContactRow(data: z.output<typeof contactSchema>) {
  return {
    name: data.name,
    howMet: data.howMet || null,
    phone: data.phone || null,
    email: data.email || null,
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
