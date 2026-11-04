import { sql } from "drizzle-orm";
import { index, integer, pgEnum, pgTable, primaryKey, text, timestamp, uniqueIndex } from "drizzle-orm/pg-core";

import { users } from "./auth-schema";

// Users, sessions and sign-in links: the tables of Better Auth.
export * from "./auth-schema";

// How often the user wants to be in touch with a contact. NULL in the column means "not set".
// The list lives here so the form, validation and labels all take it from one place.
export const contactFrequencies = ["week", "month", "quarter", "year"] as const;
export type ContactFrequency = (typeof contactFrequencies)[number];

export const contactFrequencyEnum = pgEnum("contact_frequency", contactFrequencies);

// Every contact belongs to one user, its owner: only the owner sees and changes it. The link to
// users has no cascade, so deleting a user by hand cannot wipe their contacts: the database refuses.
export const contacts = pgTable(
  "contacts",
  {
    id: integer().primaryKey().generatedAlwaysAsIdentity(),
    userId: text("user_id")
      .notNull()
      .references(() => users.id),
    name: text().notNull(),
    howMet: text("how_met"),
    phone: text(),
    email: text(),
    contactFrequency: contactFrequencyEnum("contact_frequency"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [index("contacts_user_id_idx").on(table.userId)],
);

// A note belongs to the owner of its contact.
export const notes = pgTable(
  "notes",
  {
    id: integer().primaryKey().generatedAlwaysAsIdentity(),
    contactId: integer("contact_id")
      .notNull()
      .references(() => contacts.id, { onDelete: "cascade" }),
    body: text().notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [index("notes_contact_id_idx").on(table.contactId)],
);

// Contact groups, each of one user, like contacts. The order of groups everywhere is the order
// of creation, i.e. by id. The unique index on (user_id, lower(name)) makes "теннис" and "Теннис"
// one group of a user, even for two simultaneous requests, while two users may both have «Друзья».
// It also serves as the index for finding a user's groups.
export const groups = pgTable(
  "groups",
  {
    id: integer().primaryKey().generatedAlwaysAsIdentity(),
    userId: text("user_id")
      .notNull()
      .references(() => users.id),
    name: text().notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [uniqueIndex("groups_user_id_name_lower_idx").on(table.userId, sql`lower(${table.name})`)],
);

// Who is in which group. A row disappears together with its contact or its group.
// No owner of its own: it belongs to the owner of the contact and the group.
export const contactGroups = pgTable(
  "contact_groups",
  {
    contactId: integer("contact_id")
      .notNull()
      .references(() => contacts.id, { onDelete: "cascade" }),
    groupId: integer("group_id")
      .notNull()
      .references(() => groups.id, { onDelete: "cascade" }),
  },
  (table) => [
    primaryKey({ columns: [table.contactId, table.groupId] }),
    index("contact_groups_group_id_idx").on(table.groupId),
  ],
);

// Sign-in emails sent in the last 10 minutes, one row per email: the limit of 3 emails per address
// counts these rows. Older rows are deleted on every request, so an address stays here only briefly.
export const signInEmails = pgTable(
  "sign_in_emails",
  {
    id: integer().primaryKey().generatedAlwaysAsIdentity(),
    email: text().notNull(),
    sentAt: timestamp("sent_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [index("sign_in_emails_email_sent_at_idx").on(table.email, table.sentAt)],
);

export type Contact = typeof contacts.$inferSelect;
export type Note = typeof notes.$inferSelect;
