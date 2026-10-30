import { z } from "zod";

export const GROUP_NAME_MAX_LENGTH = 50;

// One check for the browser and the server. Whether the name is already taken is decided
// by the database (unique index on lower(name)), not here.
// Messages are shown to the user, so they are in Russian.
export const groupNameSchema = z
  .string()
  .trim()
  .min(1, "Укажите название группы")
  .max(GROUP_NAME_MAX_LENGTH, "Слишком длинное название");

// What the group forms keep between submissions: the page «Группы» forms and the new-group
// field of the contact form share the shapes below.
export type GroupFormState = {
  // The text that was typed, returned on failure so the field keeps it.
  name?: string;
  error?: string;
  // Changes on every successful save so the form can react to it.
  savedAt?: number;
};

// A successful delete only refreshes the list, so only a failure comes back as state.
export type DeleteGroupState = {
  error?: string;
};
