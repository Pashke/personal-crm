"use client";

import { useEffect, useRef } from "react";
import { toast } from "sonner";

// Shown once after a contact is created: scrolls the list to the new row and confirms it.
export function AddedContactNotice({ id, name }: { id: number; name: string }) {
  const shownRef = useRef(false);

  useEffect(() => {
    if (shownRef.current) return;
    shownRef.current = true;

    document.getElementById(`contact-${id}`)?.scrollIntoView({ block: "center" });
    toast.success(`Контакт «${name}» добавлен`);
    // Drop ?added= so a page reload does not repeat the notice.
    window.history.replaceState(null, "", "/");
  }, [id, name]);

  return null;
}
