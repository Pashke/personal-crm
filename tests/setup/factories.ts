import { eq } from "drizzle-orm";

import { getDb } from "@/db";
import { contactGroups, contacts, groups, notes } from "@/db/schema";

// Test data written straight into the database, so a test about one thing does not depend on
// the code of another. Groups and contacts get ids in the order they are created.

export async function createGroups(...names: string[]) {
  const created: { id: number; name: string }[] = [];
  // One row at a time, so ids follow the order of the names.
  for (const name of names) {
    const [row] = await getDb().insert(groups).values({ name }).returning({ id: groups.id, name: groups.name });
    created.push(row);
  }
  return created;
}

export async function createContactRow(
  values: Partial<typeof contacts.$inferInsert> & { name: string } = { name: "Тестовый Контакт" },
) {
  const [row] = await getDb().insert(contacts).values(values).returning();
  return row;
}

export async function addToGroups(contactId: number, groupIds: number[]) {
  if (groupIds.length === 0) return;
  await getDb()
    .insert(contactGroups)
    .values(groupIds.map((groupId) => ({ contactId, groupId })));
}

export async function addNoteRow(contactId: number, body: string, createdAt?: Date) {
  const [row] = await getDb().insert(notes).values({ contactId, body, createdAt }).returning();
  return row;
}

export async function contactRow(id: number) {
  const [row] = await getDb().select().from(contacts).where(eq(contacts.id, id));
  return row;
}

export async function notesOf(contactId: number) {
  return getDb().select().from(notes).where(eq(notes.contactId, contactId)).orderBy(notes.id);
}

// Ids of the groups a contact is stored in, ascending.
export async function groupIdsOf(contactId: number) {
  const rows = await getDb()
    .select({ groupId: contactGroups.groupId })
    .from(contactGroups)
    .where(eq(contactGroups.contactId, contactId));
  return rows.map((row) => row.groupId).sort((a, b) => a - b);
}

export async function allGroups() {
  return getDb().select().from(groups).orderBy(groups.id);
}
