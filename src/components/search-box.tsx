"use client";

import { Loader2Icon } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useTransition } from "react";

import { Input } from "@/components/ui/input";
import { homeHref } from "@/lib/home-href";

const DEBOUNCE_MS = 250;

// Live search: the query goes into the URL (?q=...), the server filters the list.
// The selected group (?group=...) is kept, so typing and clearing never drop it.
export function SearchBox({ initialQuery, groupId }: { initialQuery: string; groupId: number | null }) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const inputRef = useRef<HTMLInputElement>(null);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastSentRef = useRef(initialQuery);

  // The URL can change without typing (e.g. a click on the header link): show that query.
  useEffect(() => {
    if (initialQuery !== lastSentRef.current && inputRef.current) {
      lastSentRef.current = initialQuery;
      inputRef.current.value = initialQuery;
    }
  }, [initialQuery]);

  useEffect(() => () => clearTimer(timerRef), []);

  function search(raw: string) {
    clearTimer(timerRef);
    const query = raw.trim();
    if (query === lastSentRef.current) return;
    lastSentRef.current = query;
    startTransition(() => {
      router.replace(homeHref({ q: query, groupId }), { scroll: false });
    });
  }

  return (
    <form
      role="search"
      className="relative"
      onSubmit={(event) => {
        event.preventDefault();
        search(inputRef.current?.value ?? "");
      }}
    >
      {/* The landing's search mark: a small ring instead of an icon */}
      <span
        aria-hidden
        className="pointer-events-none absolute top-1/2 left-3.5 size-3 -translate-y-1/2 rounded-full border-2 border-popover-foreground md:left-4.5 md:size-3.5"
      />
      <Input
        ref={inputRef}
        type="search"
        name="q"
        defaultValue={initialQuery}
        placeholder="Найти по имени"
        aria-label="Найти контакт по имени"
        autoComplete="off"
        className="pr-10 pl-9 md:pr-12 md:pl-11"
        onChange={(event) => {
          const value = event.target.value;
          clearTimer(timerRef);
          timerRef.current = setTimeout(() => search(value), DEBOUNCE_MS);
        }}
      />
      {isPending && (
        <Loader2Icon
          aria-label="Ищу…"
          className="absolute top-1/2 right-3.5 size-4 -translate-y-1/2 animate-spin text-popover-foreground md:right-4.5"
        />
      )}
    </form>
  );
}

function clearTimer(timerRef: { current: ReturnType<typeof setTimeout> | null }) {
  if (timerRef.current) {
    clearTimeout(timerRef.current);
    timerRef.current = null;
  }
}
