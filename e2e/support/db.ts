import type { Client } from "pg";

import type { ContactFrequency } from "../../src/db/schema";
import { testDatabaseName, withTestClient } from "../../tests/setup/test-db";

// Test data goes straight into the database, so a scenario does not depend on the screens of another one.
// Contacts and groups are seeded for a user who has already signed in (see signIn): `owner` is their address.

// Every test starts from empty tables: no contacts, no users, no sessions, no sign-in links.
export async function resetData() {
  await withTestClient(testDatabaseName(), async (client) => {
    await client.query(
      `TRUNCATE contacts, groups, notes, contact_groups, users, sessions, accounts, verifications, sign_in_emails
       RESTART IDENTITY CASCADE`,
    );
  });
}

async function userIdOf(client: Client, email: string) {
  const { rows } = await client.query<{ id: string }>("SELECT id FROM users WHERE email = $1", [email]);
  if (rows.length === 0) throw new Error(`No user ${email}: sign in before seeding their contacts`);
  return rows[0].id;
}

export async function seedContacts(owner: string, names: string[]) {
  await withTestClient(testDatabaseName(), async (client) => {
    const userId = await userIdOf(client, owner);
    for (const name of names) {
      await client.query("INSERT INTO contacts (user_id, name) VALUES ($1, $2)", [userId, name]);
    }
  });
}

type SeededContact = {
  name: string;
  frequency?: ContactFrequency;
  // When the contact was added; now by default.
  createdAt?: Date;
  notes?: { body: string; createdAt: Date }[];
  // Group names; a group of the owner is created on first use.
  groups?: string[];
  // Month 1–12; the year may be left out.
  birthday?: { day: number; month: number; year?: number | null };
};

// One contact of the owner with its frequency, notes, groups and birthday; returns its id.
export async function seedContact(
  owner: string,
  { name, frequency, createdAt = new Date(), notes = [], groups = [], birthday }: SeededContact,
) {
  return withTestClient(testDatabaseName(), async (client) => {
    const userId = await userIdOf(client, owner);
    const { rows } = await client.query<{ id: number }>(
      `INSERT INTO contacts (user_id, name, contact_frequency, created_at, birth_day, birth_month, birth_year)
       VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING id`,
      [
        userId,
        name,
        frequency ?? null,
        createdAt,
        birthday?.day ?? null,
        birthday?.month ?? null,
        birthday?.year ?? null,
      ],
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
      await client.query(
        "INSERT INTO groups (user_id, name) VALUES ($1, $2) ON CONFLICT (user_id, (lower(name))) DO NOTHING",
        [userId, group],
      );
      await client.query(
        `INSERT INTO contact_groups (contact_id, group_id)
         SELECT $1, id FROM groups WHERE user_id = $2 AND lower(name) = lower($3)`,
        [id, userId, group],
      );
    }
    return id;
  });
}
