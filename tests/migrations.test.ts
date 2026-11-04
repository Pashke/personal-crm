import { cpSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { drizzle } from "drizzle-orm/node-postgres";
import { Pool, type Client } from "pg";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { getDatabaseConfig } from "@/db/config";
import * as schema from "@/db/schema";
import { createAuth } from "@/lib/create-auth";

import { emailsTo } from "./setup/mail-trap";
import { signInLinkOf } from "./setup/mailpit";
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

// Everything the app kept before sign-in appeared, in a stable order, without the owner column
// that the sign-in feature adds: "the same rows and fields as before".
const withoutOwner = (rows: Record<string, unknown>[]) =>
  rows.map((row) => Object.fromEntries(Object.entries(row).filter(([column]) => column !== "user_id")));

async function readAppData(client: Client) {
  const contacts = await client.query("select * from contacts order by id");
  const notes = await client.query("select * from notes order by id");
  const groups = await client.query("select * from groups order by id");
  const links = await client.query("select * from contact_groups order by contact_id, group_id");
  return {
    contacts: withoutOwner(contacts.rows),
    notes: notes.rows,
    groups: withoutOwner(groups.rows),
    links: links.rows,
  };
}

// Two contacts with notes, one of them in two of the default groups, plus a group of the user's own.
async function insertAppData(client: Client) {
  await client.query(
    `insert into contacts (name, how_met, phone, email, contact_frequency) values
       ('Анна Соколова', 'Однокурсница', '+7 900 123-45-67', 'anna@example.com', 'month'),
       ('Иван Петров', null, null, null, null)`,
  );
  await client.query(
    `insert into notes (contact_id, body) values (1, 'Созвонились'), (1, 'Встретились на кофе'), (2, 'Написал сам')`,
  );
  await client.query(`insert into groups (name) values ('Коллеги')`);
  await client.query(`insert into contact_groups (contact_id, group_id) values (1, 1), (1, 4), (2, 6)`);
}

async function tableNames(client: Client) {
  const { rows } = await client.query<{ tablename: string }>(
    "select tablename from pg_tables where schemaname = 'public' order by tablename",
  );
  return rows.map((row) => row.tablename);
}

describe("sign-in tables migration", () => {
  it("adds the sign-in tables, existing contacts, notes, groups and links unchanged", async () => {
    await applyMigrations(scratchDb, migrationsUpTo("0003_default_groups"));
    const before = await withTestClient(scratchDb, async (client) => {
      await insertAppData(client);
      return readAppData(client);
    });

    await applyMigrations(scratchDb);

    await withTestClient(scratchDb, async (client) => {
      expect(await tableNames(client)).toEqual(
        expect.arrayContaining(["users", "sessions", "accounts", "verifications", "sign_in_emails"]),
      );
      expect(await readAppData(client)).toEqual(before);
    });
  });
});

describe("owner of the existing data migration", () => {
  const ownerOf = async (client: Client) => {
    const users = await client.query<{ id: string; email: string }>("select id, email from users");
    const contactOwners = await client.query<{ user_id: string }>("select distinct user_id from contacts");
    const groupOwners = await client.query<{ user_id: string }>("select distinct user_id from groups");
    return {
      users: users.rows,
      contactOwners: contactOwners.rows.map((row) => row.user_id),
      groupOwners: groupOwners.rows.map((row) => row.user_id),
    };
  };

  it("Выкатка с данными: the same rows and fields, every contact and group belongs to the owner", async () => {
    await applyMigrations(scratchDb, migrationsUpTo("0004_sign_in_tables"));
    const before = await withTestClient(scratchDb, async (client) => {
      await insertAppData(client);
      return readAppData(client);
    });

    await applyMigrations(scratchDb, "drizzle", { ownerEmail: " Owner@Example.com " });

    await withTestClient(scratchDb, async (client) => {
      expect(await readAppData(client)).toEqual(before);
      const { users, contactOwners, groupOwners } = await ownerOf(client);
      expect(users).toEqual([{ id: expect.stringMatching(/^[A-Za-z0-9]{32}$/), email: "owner@example.com" }]);
      expect(contactOwners).toEqual([users[0].id]);
      expect(groupOwners).toEqual([users[0].id]);
    });
  });

  it("Почта владельца не задана: the migrations fail, no sign-in tables, no owner columns, data as it was", async () => {
    await applyMigrations(scratchDb, migrationsUpTo("0003_default_groups"));
    const before = await withTestClient(scratchDb, async (client) => {
      await insertAppData(client);
      return { data: await readAppData(client), tables: await tableNames(client) };
    });

    await expect(applyMigrations(scratchDb, "drizzle", { ownerEmail: null })).rejects.toThrow();

    await withTestClient(scratchDb, async (client) => {
      expect(await tableNames(client)).toEqual(before.tables);
      expect(await tableNames(client)).not.toContain("users");
      const { rows } = await client.query("select * from contacts order by id");
      expect(rows[0]).not.toHaveProperty("user_id");
      expect(await readAppData(client)).toEqual(before.data);
    });
  });

  it("Первая выкатка: a fresh database, the five default groups belong to the owner, in their order", async () => {
    await applyMigrations(scratchDb);

    await withTestClient(scratchDb, async (client) => {
      const { rows } = await client.query<{ name: string; email: string }>(
        "select g.name, u.email from groups g join users u on u.id = g.user_id order by g.id",
      );
      expect(rows).toEqual(
        ["Семья", "Друзья", "Знакомые", "Теннис", "Аналитики"].map((name) => ({ name, email: "owner@example.com" })),
      );
    });
  });

  it("an owner who is already a user gets the data, no second user is created", async () => {
    await applyMigrations(scratchDb, migrationsUpTo("0004_sign_in_tables"));
    await withTestClient(scratchDb, async (client) => {
      await insertAppData(client);
      await client.query(
        "insert into users (id, name, email, email_verified, updated_at) values ('existing-owner-id', '', 'owner@example.com', true, now())",
      );
    });

    await applyMigrations(scratchDb);

    await withTestClient(scratchDb, async (client) => {
      expect(await ownerOf(client)).toEqual({
        users: [{ id: "existing-owner-id", email: "owner@example.com" }],
        contactOwners: ["existing-owner-id"],
        groupOwners: ["existing-owner-id"],
      });
    });
  });

  it("a database without contacts and groups needs no owner", async () => {
    await applyMigrations(scratchDb, migrationsUpTo("0004_sign_in_tables"));
    await withTestClient(scratchDb, (client) => client.query("delete from groups"));

    await applyMigrations(scratchDb, "drizzle", { ownerEmail: null });

    await withTestClient(scratchDb, async (client) => {
      expect((await ownerOf(client)).users).toEqual([]);
    });
  });

  it("Первый вход владельца: the link to the owner's address signs in as the user who got the data", async () => {
    await applyMigrations(scratchDb, migrationsUpTo("0004_sign_in_tables"));
    await withTestClient(scratchDb, insertAppData);
    await applyMigrations(scratchDb);

    const pool = new Pool({ ...getDatabaseConfig(), database: scratchDb });
    try {
      const auth = createAuth(drizzle(pool, { schema }));
      await auth.api.signInMagicLink({
        body: { email: "owner@example.com", callbackURL: "/" },
        headers: new Headers(),
      });
      const response = await auth.handler(new Request(signInLinkOf(emailsTo("owner@example.com")[0])));
      expect(new URL(response.headers.get("location")!).pathname).toBe("/");

      const { rows } = await pool.query<{ user_id: string; contacts: string }>(
        "select s.user_id, (select count(*) from contacts c where c.user_id = s.user_id) as contacts from sessions s",
      );
      expect(rows).toEqual([{ user_id: expect.any(String), contacts: "2" }]);
    } finally {
      await pool.end();
    }
  });
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
      expect(withoutOwner(contacts.rows)).toEqual(before[0].rows);
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
      expect(withoutOwner(contacts.rows)).toEqual(before[0].rows.map((row) => ({ ...row, contact_frequency: null })));
      expect(notes.rows).toEqual(before[1].rows);
    });
  });
});
