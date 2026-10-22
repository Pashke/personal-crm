import "server-only";

import { and, asc, count, desc, eq, getTableColumns, ilike, isNotNull, sql, type SQL } from "drizzle-orm";
import { connection } from "next/server";
import { cache } from "react";

import { getDb } from "@/db";
import { contacts, notes, type ContactFrequency } from "@/db/schema";
import { describeError } from "@/lib/describe-error";

// Every read waits for a request: contacts change at runtime, so pages must never be
// prerendered at build time with a frozen snapshot of the database.

// The two expressions below need `notes` left-joined to `contacts` and the query grouped
// by contacts.id. The home page block and the contact page both use them, so the due date
// is computed by one formula everywhere.

// The moment of the latest note; NULL while the contact has no notes.
const lastNoteAt = asTimestamp(sql`max(${notes.createdAt})`);

// When it is time to get in touch again: the last contact (the latest note, or the moment
// the contact was added) plus the chosen period. Postgres adds months by the calendar and
// clips to the end of the month: 31 Jan + 1 month = 28/29 Feb. NULL when no frequency is set.
const dueAt = asTimestamp(sql`(
  coalesce(max(${notes.createdAt}), ${contacts.createdAt}) +
  case ${contacts.contactFrequency}
    when 'week' then interval '7 days'
    when 'month' then interval '1 month'
    when 'quarter' then interval '3 months'
    when 'year' then interval '1 year'
  end
)`);

export async function listContacts(query: string) {
  await connection();

  // Every word must appear in the name: "ив пет" finds "Иван Петров".
  const words = query.trim().split(/\s+/).filter(Boolean);
  const filter = words.length
    ? and(...words.map((word) => ilike(contacts.name, `%${escapeLike(word)}%`)))
    : undefined;

  try {
    return await getDb()
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
  } catch (error) {
    // The original error carries the search words, usually someone's name, and Next.js
    // logs whatever a page throws. Rethrow a bare error so the error page still shows.
    console.error("Failed to list contacts", { error: describeError(error) });
    throw new Error("Failed to list contacts");
  }
}

export async function countContacts() {
  await connection();
  const [row] = await getDb().select({ value: count() }).from(contacts);
  return row.value;
}

// Contacts it is time to get in touch with: a frequency is set and the due date has come.
// The most overdue come first; the page decides how many of them to show.
export async function listDueContacts() {
  await connection();
  return getDb()
    .select({
      id: contacts.id,
      name: contacts.name,
      // Never NULL here: contacts without a frequency are filtered out below.
      contactFrequency: sql<ContactFrequency>`${contacts.contactFrequency}`,
      lastNoteAt,
      dueAt,
    })
    .from(contacts)
    .leftJoin(notes, eq(notes.contactId, contacts.id))
    .where(isNotNull(contacts.contactFrequency))
    .groupBy(contacts.id)
    .having(sql`${dueAt} <= now()`)
    .orderBy(dueAt, sql`${contacts.name} collate "ru-x-icu"`, asc(contacts.id));
}

// Wrapped in cache() so the page and its metadata share one query per request.
// Besides the contact itself, returns the moment of its latest note and the due date.
export const getContact = cache(async (id: number) => {
  await connection();
  const [contact] = await getDb()
    .select({ ...getTableColumns(contacts), lastNoteAt, dueAt })
    .from(contacts)
    .leftJoin(notes, eq(notes.contactId, contacts.id))
    .where(eq(contacts.id, id))
    .groupBy(contacts.id);
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

// The driver returns timestamps as text: Drizzle parses them only for its own columns,
// so an expression borrows the parser of a timestamp column. NULL stays NULL.
function asTimestamp(expression: SQL) {
  return expression.mapWith(contacts.createdAt) as SQL<Date | null>;
}
