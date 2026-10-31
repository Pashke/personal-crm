import { cpSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import type { Client } from "pg";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { applyMigrations, dropDatabase, recreateDatabase, testDatabaseName, withTestClient } from "./setup/test-db";

// A scratch database of its own: these tests need the state "before the feature" too,
// which the shared test database (always fully migrated) cannot give.
const scratchDb = testDatabaseName().replace(/_test$/, "_migration_test");
const tempFolders: string[] = [];

// A copy of drizzle/ that stops after the given migration, to build the database as it was
// before the feature was rolled out.
function migrationsUpTo(lastTag: string) {
  const folder = mkdtempSync(join(tmpdir(), "crm-migrations-"));
  tempFolders.push(folder);
  cpSync("drizzle", folder, { recursive: true });

  const journalPath = join(folder, "meta", "_journal.json");
  const journal = JSON.parse(readFileSync(journalPath, "utf8")) as { entries: { tag: string }[] };
  const last = journal.entries.findIndex((entry) => entry.tag === lastTag);
  if (last === -1) throw new Error(`No migration ${lastTag} in drizzle/`);
  journal.entries = journal.entries.slice(0, last + 1);
  writeFileSync(journalPath, JSON.stringify(journal));
  return folder;
}

beforeEach(async () => {
  await recreateDatabase(scratchDb);
});

afterEach(async () => {
  await dropDatabase(scratchDb);
  for (const folder of tempFolders.splice(0)) rmSync(folder, { recursive: true, force: true });
});

describe("default groups migration", () => {
  it("Первая выкатка: creates the five default groups in order, without contacts", async () => {
    await applyMigrations(scratchDb);

    await withTestClient(scratchDb, async (client) => {
      const groups = await client.query<{ name: string }>('select name from "groups" order by id');
      expect(groups.rows.map((row) => row.name)).toEqual(["Семья", "Друзья", "Знакомые", "Теннис", "Аналитики"]);

      const links = await client.query<{ count: string }>("select count(*) from contact_groups");
      expect(Number(links.rows[0].count)).toBe(0);
    });
  });

  it("Контакты, добавленные до фичи: stay without groups, fields and notes unchanged", async () => {
    await applyMigrations(scratchDb, migrationsUpTo("0001_contact_frequency"));

    const read = (client: Client) =>
      Promise.all([
        client.query("select * from contacts order by id"),
        client.query("select * from notes order by id"),
      ]);

    const before = await withTestClient(scratchDb, async (client) => {
      await client.query(
        `insert into contacts (name, how_met, phone, email, contact_frequency) values
           ('Анна Соколова', 'Однокурсница', '+7 900 123-45-67', 'anna@example.com', 'month'),
           ('Иван Петров', null, null, null, null)`,
      );
      await client.query(
        `insert into notes (contact_id, body) values (1, 'Созвонились'), (1, 'Встретились на кофе'), (2, 'Написал сам')`,
      );
      return read(client);
    });

    await applyMigrations(scratchDb);

    await withTestClient(scratchDb, async (client) => {
      const [contacts, notes] = await read(client);
      expect(contacts.rows).toEqual(before[0].rows);
      expect(notes.rows).toEqual(before[1].rows);

      const links = await client.query<{ count: string }>("select count(*) from contact_groups");
      expect(Number(links.rows[0].count)).toBe(0);
    });
  });
});

describe("contact frequency migration", () => {
  it("Контакты, добавленные до фичи: get «Не задано», fields and notes unchanged", async () => {
    await applyMigrations(scratchDb, migrationsUpTo("0000_init"));

    const read = (client: Client) =>
      Promise.all([
        client.query("select * from contacts order by id"),
        client.query("select * from notes order by id"),
      ]);

    const before = await withTestClient(scratchDb, async (client) => {
      await client.query(
        `insert into contacts (name, how_met, phone, email, created_at) values
           ('Анна Соколова', 'Однокурсница', '+7 900 123-45-67', 'anna@example.com', '2025-03-01T12:00:00Z'),
           ('Иван Петров', null, null, null, '2026-01-15T12:00:00Z')`,
      );
      await client.query(
        `insert into notes (contact_id, body, created_at) values
           (1, 'Созвонились', '2026-09-01T12:00:00Z'), (2, 'Встретились на кофе', '2026-10-05T12:00:00Z')`,
      );
      return read(client);
    });

    await applyMigrations(scratchDb);

    await withTestClient(scratchDb, async (client) => {
      const [contacts, notes] = await read(client);
      expect(contacts.rows.map((row) => row.contact_frequency)).toEqual([null, null]);
      // Every other column is as it was: the old rows plus the new column set to «Не задано».
      expect(contacts.rows).toEqual(before[0].rows.map((row) => ({ ...row, contact_frequency: null })));
      expect(notes.rows).toEqual(before[1].rows);
    });
  });
});
