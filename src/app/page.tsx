import Link from "next/link";

import { AddedContactNotice } from "@/components/added-contact-notice";
import { SearchBox } from "@/components/search-box";
import { Button } from "@/components/ui/button";
import { countContacts, listContacts } from "@/lib/contacts";
import { formatCount, initials, pluralize, splitMatches } from "@/lib/format";

export default async function ContactsPage({ searchParams }: PageProps<"/">) {
  const { q, added } = await searchParams;
  const query = typeof q === "string" ? q.trim() : "";
  const addedId = typeof added === "string" ? Number(added) : null;

  const [items, total] = await Promise.all([listContacts(query), countContacts()]);
  const addedContact = addedId ? items.find((item) => item.id === addedId) : undefined;

  return (
    <div className="flex flex-col gap-5 md:gap-6">
      <div className="flex flex-wrap items-end justify-between gap-x-6 gap-y-4">
        <div className="flex flex-col gap-1.5">
          <h1 className="font-display text-title font-bold uppercase">Контакты</h1>
          <p className="text-meta text-muted-foreground">
            {query
              ? `Найдено ${formatCount(items.length)} из ${formatCount(total)}`
              : `${formatCount(total)} ${pluralize(total, ["контакт", "контакта", "контактов"])}`}
          </p>
        </div>
        <Button asChild size="lg" className="w-full sm:w-auto">
          <Link href="/contacts/new">Добавить контакт</Link>
        </Button>
      </div>

      <SearchBox initialQuery={query} />

      {items.length === 0 ? (
        <EmptyState query={query} />
      ) : (
        <ul className="divide-y rounded-sm border">
          {items.map((contact) => (
            <li key={contact.id} id={`contact-${contact.id}`}>
              <Link
                href={`/contacts/${contact.id}`}
                prefetch={false}
                className="contact-row"
                data-added={contact.id === addedId || undefined}
              >
                <span aria-hidden>{initials(contact.name)}</span>
                <span>
                  {query
                    ? splitMatches(contact.name, query).map((part, i) =>
                        part.match ? <mark key={i}>{part.text}</mark> : part.text,
                      )
                    : contact.name}
                </span>
                <span>{contact.howMet}</span>
                <span>{contact.phone ?? contact.email}</span>
              </Link>
            </li>
          ))}
        </ul>
      )}

      {addedContact && <AddedContactNotice id={addedContact.id} name={addedContact.name} />}
    </div>
  );
}

function EmptyState({ query }: { query: string }) {
  return (
    <div className="rounded-sm border border-dashed px-4 py-12 text-center text-muted-foreground">
      {query ? (
        <p>Никого не нашлось по запросу «{query}»</p>
      ) : (
        <p>
          Пока нет ни одного контакта.{" "}
          <Link href="/contacts/new" className="text-accent underline underline-offset-4">
            Добавьте первый
          </Link>
        </p>
      )}
    </div>
  );
}
