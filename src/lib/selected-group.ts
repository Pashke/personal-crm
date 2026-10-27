import { parseId } from "@/lib/ids";

// The group chosen on the home page, from ?group=<id>. Anything that is not the id of an existing
// group (junk, a repeated parameter, a group deleted since the link was saved) means «Все»: null.
export function resolveSelectedGroup(param: string | string[] | undefined, groups: { id: number }[]) {
  if (typeof param !== "string") return null;
  const id = parseId(param);
  return id !== null && groups.some((group) => group.id === id) ? id : null;
}
