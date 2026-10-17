import "server-only";

import { and, asc, count, desc, eq, ilike, sql } from "drizzle-orm";
import { connection } from "next/server";
import { cache } from "react";

import { getDb } from "@/db";
import { contacts, notes } from "@/db/schema";

// Every read waits for a request: contacts change at runtime, so pages must never be
// prerendered at build time with a frozen snapshot of the database.

export async function listContacts(query: string) {
  await connection();

  // Every word must appear in the name: "ив пет" finds "Иван Петров".
  const words = query.trim().split(/\s+/).filter(Boolean);
  const filter = words.length
    ? and(...words.map((word) => ilike(contacts.name, `%${escapeLike(word)}%`)))
    : undefined;

  return getDb()
    .select({
      id: contacts.id,
      name: contacts.name,
      howMet: contacts.howMet,
      phone: contacts.phone,
      email: contacts.email,
    })
    .from(contacts)
    .where(filter)
    .orderBy(sql`${contacts.name} collate "ru-x-icu"`, asc(contacts.id));
}

export async function countContacts() {
  await connection();
  const [row] = await getDb().select({ value: count() }).from(contacts);
  return row.value;
}

// Wrapped in cache() so the page and its metadata share one query per request.
export const getContact = cache(async (id: number) => {
  await connection();
  const [contact] = await getDb().select().from(contacts).where(eq(contacts.id, id));
  return contact ?? null;
});

export async function listNotes(contactId: number) {
  await connection();
  return getDb()
    .select()
    .from(notes)
    .where(eq(notes.contactId, contactId))
    .orderBy(desc(notes.createdAt), desc(notes.id));
}

export function parseContactId(raw: string): number | null {
  if (!/^\d{1,9}$/.test(raw)) return null;
  const id = Number(raw);
  return id > 0 ? id : null;
}

function escapeLike(value: string) {
  return value.replace(/[\\%_]/g, (char) => `\\${char}`);
}
