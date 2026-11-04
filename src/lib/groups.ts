import "server-only";

import { and, asc, count, eq, inArray, sql } from "drizzle-orm";
import { connection } from "next/server";

import { getDb } from "@/db";
import { contactGroups, contacts, groups } from "@/db/schema";

// Groups always go in the order of creation, which is the order of their ids.
// Every function takes the signed-in user's id and works only with that user's groups.

// Every group of the user with the number of the user's contacts in it, for the page «Группы»
// and the filter on the home page.
export async function listGroups(userId: string) {
  await connection();
  return getDb()
    .select({ id: groups.id, name: groups.name, contactCount: count(contacts.id) })
    .from(groups)
    .leftJoin(contactGroups, eq(contactGroups.groupId, groups.id))
    .leftJoin(contacts, and(eq(contacts.id, contactGroups.contactId), eq(contacts.userId, userId)))
    .where(eq(groups.userId, userId))
    .groupBy(groups.id)
    .orderBy(asc(groups.id));
}

// The groups one contact of the user is in; none for someone else's contact.
export async function listContactGroups(userId: string, contactId: number) {
  await connection();
  return getDb()
    .select({ id: groups.id, name: groups.name })
    .from(contactGroups)
    .innerJoin(groups, eq(groups.id, contactGroups.groupId))
    .innerJoin(contacts, eq(contacts.id, contactGroups.contactId))
    .where(and(eq(contactGroups.contactId, contactId), eq(groups.userId, userId), eq(contacts.userId, userId)))
    .orderBy(asc(groups.id));
}

// The transaction object of getDb().transaction(): what the writes below run in.
export type Tx = Parameters<Parameters<ReturnType<typeof getDb>["transaction"]>[0]>[0];

// Replaces the groups of a contact of the user, inside the transaction that saves the contact.
// `groupIds` are ticked groups: ids that are not (or no longer) groups of this user are skipped
// without an error, someone else's group included.
// `newNames` are checked names of groups to create for the user; a name the user already has
// (any letter case) does not create a group but puts the contact into the existing one.
export async function setContactGroups(
  tx: Tx,
  userId: string,
  contactId: number,
  groupIds: number[],
  newNames: string[],
) {
  const wanted = new Set(groupIds);

  if (newNames.length > 0) {
    // The unique index on (user_id, lower(name)) turns a repeat into "do nothing";
    // ids follow the order of the names.
    await tx
      .insert(groups)
      .values(newNames.map((name) => ({ userId, name })))
      .onConflictDoNothing();
    const named = await tx
      .select({ id: groups.id })
      .from(groups)
      .where(
        and(
          eq(groups.userId, userId),
          inArray(
            sql`lower(${groups.name})`,
            newNames.map((name) => sql`lower(${name})`),
          ),
        ),
      );
    for (const { id } of named) wanted.add(id);
  }

  await tx.delete(contactGroups).where(eq(contactGroups.contactId, contactId));
  if (wanted.size === 0) return;

  // Selected from the user's `groups`, so an id without a group (deleted a moment ago) or of
  // someone else's group is simply not inserted.
  await tx.insert(contactGroups).select(
    tx
      .select({ contactId: sql<number>`${contactId}::integer`.as("contact_id"), groupId: groups.id })
      .from(groups)
      .where(and(eq(groups.userId, userId), inArray(groups.id, [...wanted]))),
  );
}
