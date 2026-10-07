"use client";

import { useActionState, useEffect } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import type { NoteFormState } from "@/lib/contact-schema";

type NoteFormProps = {
  action: (state: NoteFormState, formData: FormData) => Promise<NoteFormState>;
};

export function NoteForm({ action }: NoteFormProps) {
  const [state, formAction, pending] = useActionState(action, {});

  useEffect(() => {
    if (state.savedAt) toast.success("Заметка сохранена");
  }, [state.savedAt]);

  return (
    <form action={formAction} className="space-y-2">
      <Label htmlFor="note-body" className="sr-only">
        Новая заметка
      </Label>
      <Textarea
        id="note-body"
        name="body"
        required
        rows={3}
        placeholder="О чём поговорили, о чём договорились…"
        aria-invalid={state.error ? true : undefined}
        className="text-base md:text-sm"
        onKeyDown={(event) => {
          // Ctrl+Enter (Cmd+Enter on Mac) saves the note without reaching for the mouse.
          if (event.key === "Enter" && (event.ctrlKey || event.metaKey)) {
            event.preventDefault();
            event.currentTarget.form?.requestSubmit();
          }
        }}
      />
      {state.error && <p className="text-sm text-destructive">{state.error}</p>}
      <div className="flex items-center gap-3">
        <Button type="submit" disabled={pending}>
          {pending ? "Сохраняю…" : "Добавить заметку"}
        </Button>
        <span className="hidden text-xs text-muted-foreground sm:inline">или Ctrl+Enter</span>
      </div>
    </form>
  );
}
