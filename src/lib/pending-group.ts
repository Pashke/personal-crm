import { groupNameSchema } from "@/lib/group-schema";

export type AddPendingGroupResult =
  | {
      // New groups waiting for the contact to be saved, in the order they were added.
      pending: string[];
      // Set when the typed name is an existing group: the form ticks it instead of adding a new one.
      checkGroupId: number | null;
    }
  | { error: string };

// What happens when the user types a name into «Новая группа» and presses «Добавить».
// Nothing is created here: new groups are created on the server when the contact is saved.
export function addPendingGroup(
  input: string,
  groups: { id: number; name: string }[],
  pending: string[],
): AddPendingGroupResult {
  const parsed = groupNameSchema.safeParse(input);
  if (!parsed.success) return { error: parsed.error.issues[0].message };

  const name = parsed.data;
  const same = (other: string) => other.toLowerCase() === name.toLowerCase();

  const existing = groups.find((group) => same(group.name));
  if (existing) return { pending, checkGroupId: existing.id };

  if (pending.some(same)) return { pending, checkGroupId: null };
  return { pending: [...pending, name], checkGroupId: null };
}
