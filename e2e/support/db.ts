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
