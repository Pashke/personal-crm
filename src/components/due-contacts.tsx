"use client";

import { CircleCheck } from "lucide-react";
import Link from "next/link";
import { useRef, useState } from "react";
import { toast } from "sonner";

import { logContact, undoContactLog } from "@/app/actions";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import type { LogContactResult, UndoContactLogResult } from "@/lib/contact-schema";
import { cn } from "@/lib/utils";

// One row of «Пора связаться», with every text already worded by the server.
export type DueContactRow = {
  id: number;
  name: string;
  initials: string;
  // "раз в неделю"
  frequency: string;
  // "последний раз 19 дней назад" or "ещё не общались"
  lastContact: string;
};

const SHOWN_BY_DEFAULT = 3;
const UNDO_NOTICE_MS = 5000;

// «Пора связаться» on the home page: the first three overdue contacts, the rest on request,
// and a quick note for the one just contacted.
export function DueContacts({ rows }: { rows: DueContactRow[] }) {
  const [showAll, setShowAll] = useState(false);
  // The row whose quick note field is open: one at a time.
  const [openId, setOpenId] = useState<number | null>(null);
  // Rows saved from this block hide at once, without waiting for the refreshed list,
  // and come back on «Отменить».
  const [savedIds, setSavedIds] = useState<ReadonlySet<number>>(() => new Set());
  const checkButtons = useRef(new Map<number, HTMLButtonElement>());

  const visible = rows.filter((row) => !savedIds.has(row.id));
  if (visible.length === 0) return null;
  const shown = showAll ? visible : visible.slice(0, SHOWN_BY_DEFAULT);

  function toggleAll() {
    if (showAll && !visible.slice(0, SHOWN_BY_DEFAULT).some((row) => row.id === openId)) {
      setOpenId(null);
    }
    setShowAll(!showAll);
  }

  function cancel(id: number) {
    setOpenId(null);
    checkButtons.current.get(id)?.focus();
  }

  function saved(id: number, noteId: number) {
    setOpenId(null);
    setSavedIds((ids) => new Set(ids).add(id));
    toast.success("Заметка сохранена", {
      duration: UNDO_NOTICE_MS,
      action: { label: "Отменить", onClick: () => void undo(id, noteId) },
    });
  }

  async function undo(id: number, noteId: number) {
    let result: UndoContactLogResult;
    try {
      result = await undoContactLog(noteId);
    } catch {
      result = { error: "Не удалось отменить. Попробуйте ещё раз." };
    }
    if (result.error) {
      toast.error(result.error);
      return;
    }
    // The server sends the refreshed list with the contact back in its place.
    setSavedIds((ids) => {
      const next = new Set(ids);
      next.delete(id);
      return next;
    });
  }

  return (
    <section aria-labelledby="due-contacts-title" className="flex flex-col gap-3 py-1 md:gap-4 md:py-2">
      <h2 id="due-contacts-title" className="font-display text-heading font-bold uppercase">
        Пора связаться
      </h2>

      <ul className="border-t-2 border-accent">
        {shown.map((row) => {
          const open = openId === row.id;
          return (
            <li key={row.id} className="border-b">
              <div className="flex items-center">
                {/* The link and the button sit side by side: a button inside a link is invalid
                    markup, and a tap on it would open the contact page. */}
                <Link
                  href={`/contacts/${row.id}`}
                  prefetch={false}
                  className="flex min-w-0 flex-1 items-center gap-3 px-1 py-2.5 transition-colors hover:bg-muted/40 focus-visible:-outline-offset-2 md:gap-4 md:px-4 md:py-3"
                >
                  <span
                    aria-hidden
                    className="flex size-8.5 shrink-0 items-center justify-center rounded-full border border-accent font-display text-initials font-medium text-accent md:size-10.5"
                  >
                    {row.initials}
                  </span>
                  {/* Phone: the name, then "frequency · last contact" below it.
                      Desktop: three columns in one line. */}
                  <span className="flex min-w-0 flex-1 flex-col gap-0.5 md:flex-row md:flex-wrap md:items-baseline md:gap-x-6">
                    <span className="truncate text-name font-bold md:grow md:basis-60 md:whitespace-normal md:wrap-anywhere">
                      {row.name}
                    </span>
                    <span className="text-meta md:contents">
                      <span className="text-muted-foreground md:shrink-0 md:basis-35">
                        {row.frequency}
                        <span className="md:hidden"> · </span>
                      </span>
                      <span className="text-accent md:basis-65">{row.lastContact}</span>
                    </span>
                  </span>
                </Link>
                <button
                  ref={(button) => {
                    if (!button) return;
                    checkButtons.current.set(row.id, button);
                    return () => {
                      checkButtons.current.delete(row.id);
                    };
                  }}
                  type="button"
                  title="Уже связался"
                  aria-label={`Уже связался с ${row.name}`}
                  aria-expanded={open}
                  aria-controls={open ? `quick-note-${row.id}` : undefined}
                  onClick={() => setOpenId(open ? null : row.id)}
                  className={cn(
                    "flex size-11 shrink-0 items-center justify-center rounded-full text-accent transition-colors hover:bg-muted/40 md:mr-2",
                    open && "bg-muted/60 hover:bg-muted/60",
                  )}
                >
                  <CircleCheck aria-hidden className="size-5.5 md:size-6" />
                </button>
              </div>

              {open && (
                <QuickNote row={row} onCancel={() => cancel(row.id)} onSaved={(noteId) => saved(row.id, noteId)} />
              )}
            </li>
          );
        })}
      </ul>

      {visible.length > SHOWN_BY_DEFAULT && (
        <Button variant="outline" className="w-full sm:w-auto sm:self-start" onClick={toggleAll}>
          {showAll ? "Свернуть" : "Показать всех"}
        </Button>
      )}
    </section>
  );
}

type QuickNoteProps = {
  row: DueContactRow;
  onCancel: () => void;
  onSaved: (noteId: number) => void;
};

// The short note field under a row. It lives only while open, so closing it drops the text.
function QuickNote({ row, onCancel, onSaved }: QuickNoteProps) {
  const [body, setBody] = useState("");
  const [error, setError] = useState<string>();
  const [pending, setPending] = useState(false);
  const fieldId = `quick-note-body-${row.id}`;
  const errorId = `quick-note-error-${row.id}`;

  async function save() {
    if (pending) return;
    setPending(true);
    setError(undefined);
    let result: LogContactResult;
    try {
      result = await logContact(row.id, body);
    } catch {
      // The request itself failed, e.g. the connection to the server dropped.
      result = { error: "Не удалось сохранить заметку. Попробуйте ещё раз." };
    }
    setPending(false);
    if (result.error !== undefined) {
      setError(result.error);
      return;
    }
    onSaved(result.noteId);
  }

  return (
    <form
      id={`quick-note-${row.id}`}
      className="flex flex-col gap-2.5 pr-1 pb-3.5 pl-12.5 md:pr-4 md:pb-4 md:pl-18.5"
      onSubmit={(event) => {
        event.preventDefault();
        void save();
      }}
    >
      <label htmlFor={fieldId} className="sr-only">
        Короткая заметка: {row.name}
      </label>
      <Textarea
        id={fieldId}
        rows={2}
        autoFocus
        value={body}
        onChange={(event) => setBody(event.target.value)}
        onKeyDown={(event) => {
          // Ctrl+Enter (Cmd+Enter on Mac) saves, as in the note form on the contact page.
          if (event.key === "Enter" && (event.ctrlKey || event.metaKey)) {
            event.preventDefault();
            event.currentTarget.form?.requestSubmit();
          }
        }}
        placeholder="Пару слов о разговоре — или оставьте пустым"
        aria-invalid={error ? true : undefined}
        aria-describedby={error ? errorId : undefined}
        className="min-h-0 resize-y field-sizing-fixed"
      />
      {error && (
        <p id={errorId} className="text-meta text-destructive">
          {error}
        </p>
      )}
      <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
        <Button type="submit" size="sm" disabled={pending} className="h-11 md:h-10 md:px-4">
          {pending ? "Сохраняю…" : "Сохранить"}
        </Button>
        <Button type="button" variant="outline" size="sm" onClick={onCancel} className="h-11 md:h-10 md:px-4">
          Отмена
        </Button>
        {/* A handwritten side note, like «или Ctrl+Enter» next to the contact page's note form */}
        <span className="font-hand text-note font-medium text-accent">пусто — запишем «Связались»</span>
      </div>
    </form>
  );
}
