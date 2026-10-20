"use client";

import { useEffect, useRef } from "react";
import { toast } from "sonner";

// Shown once on the list after a contact is deleted.
export function DeletedContactNotice() {
  const shownRef = useRef(false);

  useEffect(() => {
    if (shownRef.current) return;
    shownRef.current = true;

    toast.success("Контакт удалён");
    // Drop ?deleted= so a page reload does not repeat the notice.
    window.history.replaceState(null, "", "/");
  }, []);

  return null;
}
