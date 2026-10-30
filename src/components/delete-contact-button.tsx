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
import type { DeleteContactState } from "@/lib/contact-schema";
import { formatCount, pluralize } from "@/lib/format";

type DeleteContactButtonProps = {
  action: () => Promise<DeleteContactState>;
  name: string;
  noteCount: number;
};

export function DeleteContactButton({ action, name, noteCount }: DeleteContactButtonProps) {
  const [open, setOpen] = useState(false);
  const [state, formAction, pending] = useActionState(action, {});
  // Closing the dialog hides the last error; a new attempt returns a new state object.
  const [dismissed, setDismissed] = useState<DeleteContactState | null>(null);
  const error = state === dismissed ? undefined : state.error;

  function handleOpenChange(next: boolean) {
    // Esc and «Отмена» must not close the dialog halfway through a delete.
    if (pending) return;
    if (!next) setDismissed(state);
    setOpen(next);
  }

  const quotedName = <span className="text-foreground">«{name}»</span>;

  return (
    <AlertDialog open={open} onOpenChange={handleOpenChange}>
      <AlertDialogTrigger asChild>
        <Button variant="outline" className="border-destructive text-destructive">
          Удалить
        </Button>
      </AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Удалить контакт?</AlertDialogTitle>
          <AlertDialogDescription>
            {noteCount > 0 ? (
              <>
                Контакт {quotedName} и {formatCount(noteCount)}{" "}
                {pluralize(noteCount, ["заметка", "заметки", "заметок"])} будут удалены. Вернуть их не получится.
              </>
            ) : (
              <>Контакт {quotedName} будет удалён. Вернуть его не получится.</>
            )}
          </AlertDialogDescription>
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
