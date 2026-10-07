import { PlusIcon } from "lucide-react";
import Link from "next/link";

import { AddedContactNotice } from "@/components/added-contact-notice";
import { SearchBox } from "@/components/search-box";
import { Button } from "@/components/ui/button";
import { countContacts, listContacts } from "@/lib/contacts";
import { formatCount, pluralize } from "@/lib/format";

export default async function ContactsPage({ searchParams }: PageProps<"/">) {
  const { q, added } = await searchParams;
  const query = typeof q === "string" ? q.trim() : "";
  const addedId = typeof added === "string" ? Number(added) : null;

  const [items, total] = await Promise.all([listContacts(query), countContacts()]);
  const addedContact = addedId ? items.find((item) => item.id === addedId) : undefined;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="font-heading text-2xl font-semibold">Контакты</h1>
          <p className="text-sm text-muted-foreground">
            {query
              ? `Найдено ${formatCount(items.length)} из ${formatCount(total)}`
              : `${formatCount(total)} ${pluralize(total, ["контакт", "контакта", "контактов"])}`}
          </p>
        </div>
        <Button asChild size="lg">
          <Link href="/contacts/new">
            <PlusIcon />
            Добавить контакт
          </Link>
        </Button>
      </div>

      <SearchBox initialQuery={query} />

      {items.length === 0 ? (
        <EmptyState query={query} />
      ) : (
        <ul className="divide-y rounded-xl bg-card ring-1 ring-foreground/10">
          {items.map((contact) => (
            <li key={contact.id} id={`contact-${contact.id}`}>
              <Link
                href={`/contacts/${contact.id}`}
                prefetch={false}
                className="contact-row"
                data-added={contact.id === addedId || undefined}
              >
                <span>{contact.name}</span>
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
    <div className="rounded-xl border border-dashed px-4 py-12 text-center text-muted-foreground">
      {query ? (
        <p>Никого не нашлось по запросу «{query}»</p>
      ) : (
        <p>
          Пока нет ни одного контакта.{" "}
          <Link href="/contacts/new" className="text-foreground underline underline-offset-4">
            Добавьте первый
          </Link>
        </p>
      )}
    </div>
  );
}
