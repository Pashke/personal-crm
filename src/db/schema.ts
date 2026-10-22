import { index, integer, pgEnum, pgTable, text, timestamp } from "drizzle-orm/pg-core";

// How often the user wants to be in touch with a contact. NULL in the column means "not set".
// The list lives here so the form, validation and labels all take it from one place.
export const contactFrequencies = ["week", "month", "quarter", "year"] as const;
export type ContactFrequency = (typeof contactFrequencies)[number];

export const contactFrequencyEnum = pgEnum("contact_frequency", contactFrequencies);

export const contacts = pgTable("contacts", {
  id: integer().primaryKey().generatedAlwaysAsIdentity(),
  name: text().notNull(),
  howMet: text("how_met"),
  phone: text(),
  email: text(),
  contactFrequency: contactFrequencyEnum("contact_frequency"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

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

export type Contact = typeof contacts.$inferSelect;
export type Note = typeof notes.$inferSelect;
