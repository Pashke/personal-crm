"use client";

import Link from "next/link";
import { useActionState, useId, useRef, useState } from "react";

import { DeleteGroupButton } from "@/components/delete-group-button";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { formatGroupContactCount } from "@/lib/format";
import type { DeleteGroupState, GroupFormState } from "@/lib/group-schema";

type GroupRowProps = {
  name: string;
  contactCount: number;
  // The home page with this group selected.
  href: string;
  rename: (state: GroupFormState, formData: FormData) => Promise<GroupFormState>;
  remove: () => Promise<DeleteGroupState>;
};

// One group on the page «Группы». «Переименовать» turns the name into a field in place.
export function GroupRow({ name, contactCount, href, rename, remove }: GroupRowProps) {
  const [state, formAction, pending] = useActionState(rename, {});
  // The state the editor was opened with. The editor is open until a newer save succeeds
  // or «Отмена» is pressed; an error or text from before it was opened is not shown again.
  const [openedWith, setOpenedWith] = useState<GroupFormState | null>(null);
  // Set when the editor opens: the next time «Переименовать» appears (after «Отмена», Esc or a save),
  // it takes the keyboard focus back.
  const focusRenameButton = useRef(false);
  const errorId = useId();

  const editing = openedWith !== null && state.savedAt === openedWith.savedAt;
  const current = state === openedWith ? undefined : state;

  function open() {
    focusRenameButton.current = true;
    setOpenedWith(state);
  }

  function close() {
    setOpenedWith(null);
  }

  return (
    <li className="flex flex-col gap-3 border-b py-3.5 md:flex-row md:items-center md:gap-6 md:py-4">
      {editing ? (
        <form
          action={formAction}
          className="flex min-w-0 flex-1 flex-col gap-2"
          onKeyDown={(event) => {
            if (event.key === "Escape" && !pending) close();
          }}
        >
          <div className="flex flex-col gap-3 sm:flex-row">
            <Input
              name="name"
              type="text"
              autoFocus
              autoComplete="off"
              aria-label={`Новое название группы «${name}»`}
              defaultValue={current?.name ?? name}
              aria-invalid={current?.error ? true : undefined}
              aria-describedby={current?.error ? errorId : undefined}
            />
            <div className="flex gap-3">
              <Button type="submit" size="sm" disabled={pending} className="h-11 md:h-10 md:px-4">
                {pending ? "Сохраняю…" : "Сохранить"}
              </Button>
              <Button
                type="button"
                variant="outline"
                size="sm"
                disabled={pending}
                onClick={close}
                className="h-11 md:h-10 md:px-4"
              >
                Отмена
              </Button>
            </div>
          </div>
          {current?.error && (
            <p id={errorId} role="alert" className="text-meta text-destructive">
              {current.error}
            </p>
          )}
        </form>
      ) : (
        <>
          <div className="flex min-w-0 flex-1 flex-col gap-0.5 md:flex-row md:items-baseline md:gap-6">
            <Link
              href={href}
              className="min-w-0 text-name font-bold wrap-anywhere underline decoration-border underline-offset-4 transition-colors hover:decoration-accent"
            >
              {name}
            </Link>
            <span className="text-meta text-muted-foreground">{formatGroupContactCount(contactCount)}</span>
          </div>
          <div className="flex gap-3">
            <Button
              ref={(button) => {
                if (button && focusRenameButton.current) {
                  focusRenameButton.current = false;
                  button.focus();
                }
              }}
              type="button"
              variant="outline"
              size="sm"
              onClick={open}
              aria-label={`Переименовать группу «${name}»`}
              className="h-11 md:h-10 md:px-4"
            >
              Переименовать
            </Button>
            <DeleteGroupButton action={remove} name={name} contactCount={contactCount} />
          </div>
        </>
      )}
    </li>
  );
}
