// Calls a server action that ends in redirect() and returns where it sends the user.
// redirect() throws a special error whose digest looks like "NEXT_REDIRECT;push;/path;307;".
export async function redirectTarget(run: () => Promise<unknown>): Promise<string> {
  try {
    await run();
  } catch (error) {
    const digest: unknown = error instanceof Error ? Reflect.get(error, "digest") : undefined;
    if (typeof digest === "string" && digest.startsWith("NEXT_REDIRECT;")) {
      return digest.split(";")[2];
    }
    throw error;
  }
  throw new Error("Expected the action to redirect, but it returned a result");
}

// A form submission as the browser sends it. Several values for one name are allowed
// (checkboxes): pass an array.
export function formDataOf(fields: Record<string, string | string[]>) {
  const formData = new FormData();
  for (const [name, value] of Object.entries(fields)) {
    for (const item of Array.isArray(value) ? value : [value]) formData.append(name, item);
  }
  return formData;
}
