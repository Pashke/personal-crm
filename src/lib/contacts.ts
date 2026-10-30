import "server-only";

import { and, asc, count, desc, eq, exists, getTableColumns, ilike, isNotNull, sql, type SQL } from "drizzle-orm";
import { connection } from "next/server";
import { cache } from "react";

import { getDb } from "@/db";
import { contactGroups, contacts, notes, type ContactFrequency } from "@/db/schema";
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

// Narrows a contacts query to the members of one group; nothing to narrow without a group.
function inGroup(groupId: number | null | undefined) {
  if (!groupId) return undefined;
  return exists(
    getDb()
      .select({ one: sql`1` })
      .from(contactGroups)
      .where(and(eq(contactGroups.contactId, contacts.id), eq(contactGroups.groupId, groupId))),
  );
}

// The names of the groups a contact is in, in the common order (by group id); empty without groups.
// Written with plain names: inside a single-table query Drizzle drops table prefixes from columns,
// which would make the inner "id" refer to the wrong table.
const groupNames = sql<string[]>`coalesce((
  select array_agg(g.name order by g.id)
  from contact_groups cg
  join groups g on g.id = cg.group_id
  where cg.contact_id = "contacts"."id"
), '{}')`;

// The list for the home page: every contact, or the members of one group; `query` narrows it by name.
export async function listContacts(query: string, groupId?: number | null) {
  await connection();

  // Every word must appear in the name: "ив пет" finds "Иван Петров".
  const words = query.trim().split(/\s+/).filter(Boolean);
  const filter = words.length ? and(...words.map((word) => ilike(contacts.name, `%${escapeLike(word)}%`))) : undefined;
  const where = and(filter, inGroup(groupId));

  try {
    return await getDb()
      .select({
        id: contacts.id,
        name: contacts.name,
        howMet: contacts.howMet,
        phone: contacts.phone,
        email: contacts.email,
        groups: groupNames,
      })
      .from(contacts)
      .where(where)
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
// With a group selected, only the members of that group.
export async function listDueContacts(groupId?: number | null) {
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
    .where(and(isNotNull(contacts.contactFrequency), inGroup(groupId)))
    .groupBy(contacts.id)
    .having(sql`${dueAt} <= now()`)
    .orderBy(dueAt, sql`${contacts.name} collate "ru-x-icu"`, asc(contacts.id));
}

// «Пора связаться» as the home page shows it: hidden while a search is typed, so not even queried then.
export async function listDueContactsForHome(query: string, groupId: number | null) {
  return query ? [] : listDueContacts(groupId);
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

function escapeLike(value: string) {
  return value.replace(/[\\%_]/g, (char) => `\\${char}`);
}

// The driver returns timestamps as text: Drizzle parses them only for its own columns,
// so an expression borrows the parser of a timestamp column. NULL stays NULL.
function asTimestamp(expression: SQL) {
  return expression.mapWith(contacts.createdAt) as SQL<Date | null>;
}
