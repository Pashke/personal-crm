"use server";

import { and, eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";

import { getDb } from "@/db";
import { groups } from "@/db/schema";
import { describeError, isUniqueViolation } from "@/lib/describe-error";
import { groupNameSchema, type DeleteGroupState, type GroupFormState } from "@/lib/group-schema";
import { isValidId } from "@/lib/ids";
import { requireUser } from "@/lib/session";

// Every action first checks who is signed in and then touches only that user's groups: the id of
// someone else's group gets the same answer as the id of one that does not exist.

export async function createGroup(_prevState: GroupFormState, formData: FormData): Promise<GroupFormState> {
  const user = await requireUser();
  const name = String(formData.get("name") ?? "");
  const parsed = groupNameSchema.safeParse(name);
  if (!parsed.success) {
    return { name, error: parsed.error.issues[0].message };
  }

  try {
    await getDb().insert(groups).values({ userId: user.id, name: parsed.data });
  } catch (error) {
    // The unique index on (user_id, lower(name)) decides, so two simultaneous requests cannot both win.
    if (isUniqueViolation(error)) return { name, error: "Такая группа уже есть" };
    // No names in the log: only technical fields.
    console.error("Failed to create group", { error: describeError(error) });
    return { name, error: "Не удалось сохранить группу. Попробуйте ещё раз." };
  }

  revalidateGroups();
  return { savedAt: Date.now() };
}

export async function renameGroup(id: number, _prevState: GroupFormState, formData: FormData): Promise<GroupFormState> {
  const user = await requireUser();
  const name = String(formData.get("name") ?? "");
  if (!isValidId(id)) {
    return { name, error: "Группа не найдена." };
  }
  const parsed = groupNameSchema.safeParse(name);
  if (!parsed.success) {
    return { name, error: parsed.error.issues[0].message };
  }

  try {
    // Only the name changes: the id, so the place in the order and the members, stay.
    // The group's own row does not clash with itself in the unique index, so a change of case alone passes.
    const updated = await getDb()
      .update(groups)
      .set({ name: parsed.data })
      .where(and(eq(groups.id, id), eq(groups.userId, user.id)))
      .returning({ id: groups.id });
    if (updated.length === 0) {
      return { name, error: "Группа не найдена — возможно, её удалили." };
    }
  } catch (error) {
    if (isUniqueViolation(error)) return { name, error: "Такая группа уже есть" };
    console.error("Failed to rename group", { id, error: describeError(error) });
    return { name, error: "Не удалось сохранить группу. Попробуйте ещё раз." };
  }

  revalidateGroups();
  return { savedAt: Date.now() };
}

export async function deleteGroup(id: number): Promise<DeleteGroupState> {
  const user = await requireUser();
  if (!isValidId(id)) {
    return { error: "Группа не найдена." };
  }

  try {
    // Memberships go with the group (contact_groups.group_id is ON DELETE CASCADE);
    // contacts, their notes and their other groups are not touched.
    // Zero deleted rows means another tab got there first (or the group is someone else's),
    // which ends the same way.
    await getDb()
      .delete(groups)
      .where(and(eq(groups.id, id), eq(groups.userId, user.id)));
  } catch (error) {
    console.error("Failed to delete group", { id, error: describeError(error) });
    return { error: "Не удалось удалить группу. Попробуйте ещё раз." };
  }

  revalidateGroups();
  return {};
}

// Group names show on every page (filter, forms, contact lines), so the whole app is refreshed.
function revalidateGroups() {
  revalidatePath("/", "layout");
}
