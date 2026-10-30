import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Fragment } from "react";

import { addNote, deleteContact } from "@/app/actions";
import { BackLink } from "@/components/back-link";
import { DeleteContactButton } from "@/components/delete-contact-button";
import { NoteForm } from "@/components/note-form";
import { Button } from "@/components/ui/button";
import { getContact, listNotes } from "@/lib/contacts";
import { formatDateTime, formatDueStatus, frequencyLabels } from "@/lib/format";
import { listContactGroups } from "@/lib/groups";
import { homeHref } from "@/lib/home-href";
import { parseId } from "@/lib/ids";

export async function generateMetadata({ params }: PageProps<"/contacts/[id]">): Promise<Metadata> {
  const id = parseId((await params).id);
  const contact = id ? await getContact(id) : null;
  return { title: contact?.name ?? "Контакт не найден" };
}

const linkClass = "underline decoration-border underline-offset-4 transition-colors hover:decoration-accent";

export default async function ContactPage({ params }: PageProps<"/contacts/[id]">) {
  const id = parseId((await params).id);
  if (!id) notFound();

  const [contact, contactNotes, contactGroups] = await Promise.all([
    getContact(id),
    listNotes(id),
    listContactGroups(id),
  ]);
  if (!contact) notFound();

  // The due date is read from the database on every request, so "now" is this request's moment.
  const now = new Date();
  const overdue = contact.dueAt !== null && contact.dueAt <= now;

  return (
    <div className="flex flex-col gap-10 md:gap-14">
      <section className="flex flex-col gap-5 md:gap-6">
        <BackLink href="/">Все контакты</BackLink>

        <div className="flex flex-wrap items-start justify-between gap-x-6 gap-y-4">
          <h1 className="min-w-0 font-display text-title font-bold text-balance wrap-anywhere uppercase">
            {contact.name}
          </h1>
          <div className="flex gap-3">
            <Button asChild variant="outline">
              <Link href={`/contacts/${contact.id}/edit`}>Изменить</Link>
            </Button>
            <DeleteContactButton
              action={deleteContact.bind(null, contact.id)}
              name={contact.name}
              noteCount={contactNotes.length}
            />
          </div>
        </div>

        <dl className="border-t-2 border-accent">
          <Detail label="Откуда знакомы">{contact.howMet}</Detail>
          <Detail label="Группы">
            {contactGroups.length > 0 &&
              contactGroups.map((group, index) => (
                <Fragment key={group.id}>
                  {index > 0 && ", "}
                  <Link href={homeHref({ groupId: group.id })} className={linkClass}>
                    {group.name}
                  </Link>
                </Fragment>
              ))}
          </Detail>
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
          <Detail label="Как часто общаться">
            {contact.contactFrequency && contact.dueAt && (
              <>
                {frequencyLabels[contact.contactFrequency]} ·{" "}
                <span className={overdue ? "font-bold text-accent" : undefined}>
                  {formatDueStatus(contact.dueAt, now)}
                </span>
              </>
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
                <p className="whitespace-pre-wrap text-pretty wrap-anywhere">{note.body}</p>
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
      <dt className="font-display text-label font-medium text-accent uppercase md:w-48 md:shrink-0">{label}</dt>
      <dd className="min-w-0 wrap-anywhere">{children || <span className="text-muted-foreground">—</span>}</dd>
    </div>
  );
}
