"use client";

import { Loader2Icon, SearchIcon } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useTransition } from "react";

import { Input } from "@/components/ui/input";

const DEBOUNCE_MS = 250;

// Live search: the query goes into the URL (?q=...), the server filters the list.
export function SearchBox({ initialQuery }: { initialQuery: string }) {
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
      router.replace(query ? `/?q=${encodeURIComponent(query)}` : "/", { scroll: false });
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
      <SearchIcon className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
      <Input
        ref={inputRef}
        type="search"
        name="q"
        defaultValue={initialQuery}
        placeholder="Найти по имени"
        aria-label="Найти контакт по имени"
        autoComplete="off"
        className="h-10 pr-9 pl-9 text-base md:text-sm"
        onChange={(event) => {
          const value = event.target.value;
          clearTimer(timerRef);
          timerRef.current = setTimeout(() => search(value), DEBOUNCE_MS);
        }}
      />
      {isPending && (
        <Loader2Icon
          aria-label="Ищу…"
          className="absolute top-1/2 right-3 size-4 -translate-y-1/2 animate-spin text-muted-foreground"
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
