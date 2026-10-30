"use client";

import { useActionState } from "react";

import { createGroup } from "@/app/groups/actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

// «Новая группа» on the page «Группы». The field is cleared after a successful save and keeps
// the typed text after a failed one (the form is reset by React either way).
export function NewGroupForm() {
  const [state, formAction, pending] = useActionState(createGroup, {});

  return (
    <form action={formAction} className="flex max-w-xl flex-col gap-2">
      <Label htmlFor="new-group-name">Новая группа</Label>
      <div className="flex flex-col gap-3 sm:flex-row">
        <Input
          id="new-group-name"
          name="name"
          type="text"
          autoComplete="off"
          placeholder="Например: Коллеги"
          defaultValue={state.name}
          aria-invalid={state.error ? true : undefined}
          aria-describedby={state.error ? "new-group-error" : undefined}
        />
        <Button type="submit" size="lg" disabled={pending} className="sm:shrink-0">
          {pending ? "Добавляю…" : "Добавить"}
        </Button>
      </div>
      {state.error && (
        <p id="new-group-error" role="alert" className="text-meta text-destructive">
          {state.error}
        </p>
      )}
    </form>
  );
}
