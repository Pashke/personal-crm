import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

import { addNote } from "@/app/actions";
import { BackLink } from "@/components/back-link";
import { NoteForm } from "@/components/note-form";
import { Button } from "@/components/ui/button";
import { getContact, listNotes, parseContactId } from "@/lib/contacts";
import { formatDateTime } from "@/lib/format";

export async function generateMetadata({
  params,
}: PageProps<"/contacts/[id]">): Promise<Metadata> {
  const id = parseContactId((await params).id);
  const contact = id ? await getContact(id) : null;
  return { title: contact?.name ?? "Контакт не найден" };
}

const linkClass =
  "underline decoration-border underline-offset-4 transition-colors hover:decoration-accent";

export default async function ContactPage({ params }: PageProps<"/contacts/[id]">) {
  const id = parseContactId((await params).id);
  if (!id) notFound();

  const [contact, contactNotes] = await Promise.all([getContact(id), listNotes(id)]);
  if (!contact) notFound();

  return (
    <div className="flex flex-col gap-10 md:gap-14">
      <section className="flex flex-col gap-5 md:gap-6">
        <BackLink href="/">Все контакты</BackLink>

        <div className="flex flex-wrap items-start justify-between gap-x-6 gap-y-4">
          <h1 className="min-w-0 font-display text-title font-bold text-balance wrap-break-word uppercase">
            {contact.name}
          </h1>
          <Button asChild variant="outline">
            <Link href={`/contacts/${contact.id}/edit`}>Изменить</Link>
          </Button>
        </div>

        <dl className="border-t-2 border-accent">
          <Detail label="Откуда знакомы">{contact.howMet}</Detail>
          <Detail label="Телефон">
            {contact.phone && (
              <a href={`tel:${contact.phone.replace(/[^\d+]/g, "")}`} className={linkClass}>
                {contact.phone}
              </a>
            )}
          </Detail>
          <Detail label="Почта">
            {contact.email && (
              <a href={`mailto:${contact.email}`} className={`break-all ${linkClass}`}>
                {contact.email}
              </a>
            )}
          </Detail>
        </dl>
      </section>

      <section className="flex flex-col gap-5 md:gap-6">
        <h2 className="font-display text-heading font-bold uppercase">Заметки</h2>
        <NoteForm action={addNote.bind(null, contact.id)} />

        {contactNotes.length === 0 ? (
          <p className="font-hand text-note font-medium text-accent">
            Заметок пока нет. Запишите, о чём говорили и о чём договорились.
          </p>
        ) : (
          <ol className="border-t-2 border-accent">
            {contactNotes.map((note) => (
              <li key={note.id} className="flex flex-col gap-1.5 border-b py-4 md:py-5">
                <time
                  dateTime={note.createdAt.toISOString()}
                  className="font-display text-label font-medium text-muted-foreground uppercase"
                >
                  {formatDateTime(note.createdAt)}
                </time>
                <p className="whitespace-pre-wrap text-pretty">{note.body}</p>
              </li>
            ))}
          </ol>
        )}
      </section>
    </div>
  );
}

function Detail({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-1 border-b py-3.5 md:flex-row md:items-baseline md:gap-6 md:py-4">
      <dt className="font-display text-label font-medium text-accent uppercase md:w-48 md:shrink-0">
        {label}
      </dt>
      <dd className="min-w-0">{children || <span className="text-muted-foreground">—</span>}</dd>
    </div>
  );
}
