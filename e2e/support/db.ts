import type { ContactFrequency } from "../../src/db/schema";
import { testDatabaseName, withTestClient } from "../../tests/setup/test-db";

// Test data goes straight into the database, so a scenario does not depend on the screens of another one.

// Every test starts from empty tables.
export async function resetData() {
  await withTestClient(testDatabaseName(), async (client) => {
    await client.query("TRUNCATE contacts, groups, notes, contact_groups RESTART IDENTITY CASCADE");
  });
}

export async function seedContacts(names: string[]) {
  await withTestClient(testDatabaseName(), async (client) => {
    for (const name of names) {
      await client.query("INSERT INTO contacts (name) VALUES ($1)", [name]);
    }
  });
}

type SeededContact = {
  name: string;
  frequency?: ContactFrequency;
  // When the contact was added; now by default.
  createdAt?: Date;
  notes?: { body: string; createdAt: Date }[];
  // Group names; a group is created on first use.
  groups?: string[];
};

// One contact with its frequency, notes and groups; returns its id.
export async function seedContact({ name, frequency, createdAt = new Date(), notes = [], groups = [] }: SeededContact) {
  return withTestClient(testDatabaseName(), async (client) => {
    const { rows } = await client.query<{ id: number }>(
      "INSERT INTO contacts (name, contact_frequency, created_at) VALUES ($1, $2, $3) RETURNING id",
      [name, frequency ?? null, createdAt],
    );
    const id = rows[0].id;
    for (const note of notes) {
      await client.query("INSERT INTO notes (contact_id, body, created_at) VALUES ($1, $2, $3)", [
        id,
        note.body,
        note.createdAt,
      ]);
    }
    for (const group of groups) {
      await client.query("INSERT INTO groups (name) VALUES ($1) ON CONFLICT ((lower(name))) DO NOTHING", [group]);
      await client.query(
        "INSERT INTO contact_groups (contact_id, group_id) SELECT $1, id FROM groups WHERE lower(name) = lower($2)",
        [id, group],
      );
    }
    return id;
  });
}
