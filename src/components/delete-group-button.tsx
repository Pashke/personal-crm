"use client";

import { useActionState, useState } from "react";

import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { groupDeleteDescription } from "@/lib/format";
import type { DeleteGroupState } from "@/lib/group-schema";

type DeleteGroupButtonProps = {
  action: () => Promise<DeleteGroupState>;
  name: string;
  contactCount: number;
};

// «Удалить» with a confirmation window. On success the page refreshes and the row disappears,
// the window with it; only a failure stays in the window.
export function DeleteGroupButton({ action, name, contactCount }: DeleteGroupButtonProps) {
  const [open, setOpen] = useState(false);
  const [state, formAction, pending] = useActionState(action, {});
  // Closing the dialog hides the last error; a new attempt returns a new state object.
  const [dismissed, setDismissed] = useState<DeleteGroupState | null>(null);
  const error = state === dismissed ? undefined : state.error;

  function handleOpenChange(next: boolean) {
    // Esc and «Отмена» must not close the dialog halfway through a delete.
    if (pending) return;
    if (!next) setDismissed(state);
    setOpen(next);
  }

  return (
    <AlertDialog open={open} onOpenChange={handleOpenChange}>
      <AlertDialogTrigger asChild>
        <Button
          variant="outline"
          size="sm"
          className="h-11 border-destructive text-destructive md:h-10 md:px-4"
          aria-label={`Удалить группу «${name}»`}
        >
          Удалить
        </Button>
      </AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Удалить группу?</AlertDialogTitle>
          <AlertDialogDescription>{groupDeleteDescription(name, contactCount)}</AlertDialogDescription>
        </AlertDialogHeader>

        {error && (
          <p role="alert" className="rounded-sm border border-destructive px-3.5 py-2.5 text-meta text-destructive">
            {error}
          </p>
        )}

        {/* A plain submit button, not AlertDialogAction: that one closes the dialog on click,
            before the delete has even started. */}
        <form action={formAction}>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={pending}>Отмена</AlertDialogCancel>
            <Button type="submit" variant="destructive" disabled={pending}>
              {pending ? "Удаляю…" : "Удалить"}
            </Button>
          </AlertDialogFooter>
        </form>
      </AlertDialogContent>
    </AlertDialog>
  );
}
