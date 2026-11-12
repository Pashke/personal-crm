"use client";

import Link from "next/link";
import { useState } from "react";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

// One row of «Скоро день рождения», with every text already worded by the server.
export type UpcomingBirthdayRow = {
  id: number;
  name: string;
  initials: string;
  // "13 ноября"
  date: string;
  // "сегодня", "завтра", "через 5 дней"
  when: string;
  // The birthday is today: "сегодня" stands out.
  isToday: boolean;
  // "исполнится 36", "исполняется 40"; null without the year of birth
  turning: string | null;
};

const SHOWN_BY_DEFAULT = 3;

// «Скоро день рождения» on the home page: the first three birthdays of the coming week,
// the rest on request. It looks like «Пора связаться», but the whole row is a link, with no buttons.
export function UpcomingBirthdays({ rows }: { rows: UpcomingBirthdayRow[] }) {
  const [showAll, setShowAll] = useState(false);
  const shown = showAll ? rows : rows.slice(0, SHOWN_BY_DEFAULT);

  return (
    <section aria-labelledby="upcoming-birthdays-title" className="flex flex-col gap-3 py-1 md:gap-4 md:py-2">
      <h2 id="upcoming-birthdays-title" className="font-display text-heading font-bold uppercase">
        Скоро день рождения
      </h2>

      <ul className="border-t-2 border-accent">
        {shown.map((row) => (
          <li key={row.id} className="border-b">
            <Link
              href={`/contacts/${row.id}`}
              prefetch={false}
              className="flex min-w-0 items-center gap-3 px-1 py-2.5 transition-colors hover:bg-muted/40 focus-visible:-outline-offset-2 md:gap-4 md:px-4 md:py-3"
            >
              <span
                aria-hidden
                className="flex size-8.5 shrink-0 items-center justify-center rounded-full border border-accent font-display text-initials font-medium text-accent md:size-10.5"
              >
                {row.initials}
              </span>
              {/* Phone: the name, then "date · when · age" below it. Desktop: three columns in one line. */}
              <span className="flex min-w-0 flex-1 flex-col gap-0.5 md:flex-row md:flex-wrap md:items-baseline md:gap-x-6">
                <span className="truncate text-name font-bold md:grow md:basis-60 md:whitespace-normal md:wrap-anywhere">
                  {row.name}
                </span>
                <span className="text-meta text-muted-foreground md:contents">
                  <span className="md:shrink-0 md:basis-35">
                    {row.date}
                    <span className="md:hidden"> · </span>
                  </span>
                  <span className="md:basis-65">
                    <span className={cn(row.isToday && "font-bold text-accent")}>{row.when}</span>
                    {row.turning && ` · ${row.turning}`}
                  </span>
                </span>
              </span>
            </Link>
          </li>
        ))}
      </ul>

      {rows.length > SHOWN_BY_DEFAULT && (
        <Button variant="outline" className="w-full sm:w-auto sm:self-start" onClick={() => setShowAll(!showAll)}>
          {showAll ? "Свернуть" : "Показать всех"}
        </Button>
      )}
    </section>
  );
}
