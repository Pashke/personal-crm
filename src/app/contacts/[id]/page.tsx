import { MailIcon, PencilIcon, PhoneIcon, UsersIcon } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

import { addNote } from "@/app/actions";
import { BackLink } from "@/components/back-link";
import { NoteForm } from "@/components/note-form";
import { Button } from "@/components/ui/button";
import { Card, CardAction, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { getContact, listNotes, parseContactId } from "@/lib/contacts";
import { formatDateTime } from "@/lib/format";

export async function generateMetadata({
  params,
}: PageProps<"/contacts/[id]">): Promise<Metadata> {
  const id = parseContactId((await params).id);
  const contact = id ? await getContact(id) : null;
  return { title: contact?.name ?? "Контакт не найден" };
}

export default async function ContactPage({ params }: PageProps<"/contacts/[id]">) {
  const id = parseContactId((await params).id);
  if (!id) notFound();

  const [contact, contactNotes] = await Promise.all([getContact(id), listNotes(id)]);
  if (!contact) notFound();

  return (
    <div className="space-y-4">
      <BackLink href="/">Все контакты</BackLink>

      <Card>
        <CardHeader>
          <CardTitle className="text-2xl font-semibold">{contact.name}</CardTitle>
          <CardAction>
            <Button asChild variant="outline">
              <Link href={`/contacts/${contact.id}/edit`}>
                <PencilIcon />
                Изменить
              </Link>
            </Button>
          </CardAction>
        </CardHeader>
        <CardContent>
          <dl className="space-y-3">
            <Detail icon={<UsersIcon />} label="Откуда знакомы">
              {contact.howMet}
            </Detail>
            <Detail icon={<PhoneIcon />} label="Телефон">
              {contact.phone && (
                <a href={`tel:${contact.phone.replace(/[^\d+]/g, "")}`} className="hover:underline">
                  {contact.phone}
                </a>
              )}
            </Detail>
            <Detail icon={<MailIcon />} label="Почта">
              {contact.email && (
                <a href={`mailto:${contact.email}`} className="break-all hover:underline">
                  {contact.email}
                </a>
              )}
            </Detail>
          </dl>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-lg font-semibold">Заметки</CardTitle>
        </CardHeader>
        <CardContent className="space-y-6">
          <NoteForm action={addNote.bind(null, contact.id)} />

          {contactNotes.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              Заметок пока нет. Запишите, о чём говорили и о чём договорились.
            </p>
          ) : (
            <ol className="space-y-4">
              {contactNotes.map((note) => (
                <li key={note.id} className="border-l-2 pl-4">
                  <time
                    dateTime={note.createdAt.toISOString()}
                    className="block text-xs text-muted-foreground"
                  >
                    {formatDateTime(note.createdAt)}
                  </time>
                  <p className="mt-1 whitespace-pre-wrap">{note.body}</p>
                </li>
              ))}
            </ol>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function Detail({
  icon,
  label,
  children,
}: {
  icon: React.ReactNode;
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex gap-3">
      <span className="mt-0.5 text-muted-foreground [&_svg]:size-4" aria-hidden>
        {icon}
      </span>
      <div className="min-w-0">
        <dt className="text-xs text-muted-foreground">{label}</dt>
        <dd>{children || <span className="text-muted-foreground">—</span>}</dd>
      </div>
    </div>
  );
}
