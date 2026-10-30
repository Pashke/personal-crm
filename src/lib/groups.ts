import "server-only";

import { asc, count, eq, inArray, sql } from "drizzle-orm";
import { connection } from "next/server";

import { getDb } from "@/db";
import { contactGroups, groups } from "@/db/schema";

// Groups always go in the order of creation, which is the order of their ids.

// Every group with the number of contacts in it, for the page «Группы» and the filter on the home page.
export async function listGroups() {
  await connection();
  return getDb()
    .select({ id: groups.id, name: groups.name, contactCount: count(contactGroups.contactId) })
    .from(groups)
    .leftJoin(contactGroups, eq(contactGroups.groupId, groups.id))
    .groupBy(groups.id)
    .orderBy(asc(groups.id));
}

// The groups one contact is in.
export async function listContactGroups(contactId: number) {
  await connection();
  return getDb()
    .select({ id: groups.id, name: groups.name })
    .from(contactGroups)
    .innerJoin(groups, eq(groups.id, contactGroups.groupId))
    .where(eq(contactGroups.contactId, contactId))
    .orderBy(asc(groups.id));
}

// The transaction object of getDb().transaction(): what the writes below run in.
export type Tx = Parameters<Parameters<ReturnType<typeof getDb>["transaction"]>[0]>[0];

// Replaces the groups of a contact, inside the transaction that saves the contact.
// `groupIds` are ticked groups: ids that are not (or no longer) groups are skipped without an error.
// `newNames` are checked names of groups to create; a name that already exists (any letter case)
// does not create a group but puts the contact into the existing one.
export async function setContactGroups(tx: Tx, contactId: number, groupIds: number[], newNames: string[]) {
  const wanted = new Set(groupIds);

  if (newNames.length > 0) {
    // The unique index on lower(name) turns a repeat into "do nothing"; ids follow the order of the names.
    await tx
      .insert(groups)
      .values(newNames.map((name) => ({ name })))
      .onConflictDoNothing();
    const named = await tx
      .select({ id: groups.id })
      .from(groups)
      .where(
        inArray(
          sql`lower(${groups.name})`,
          newNames.map((name) => sql`lower(${name})`),
        ),
      );
    for (const { id } of named) wanted.add(id);
  }

  await tx.delete(contactGroups).where(eq(contactGroups.contactId, contactId));
  if (wanted.size === 0) return;

  // Selected from `groups`, so an id without a group (deleted a moment ago) is simply not inserted.
  await tx.insert(contactGroups).select(
    tx
      .select({ contactId: sql<number>`${contactId}::integer`.as("contact_id"), groupId: groups.id })
      .from(groups)
      .where(inArray(groups.id, [...wanted])),
  );
}
