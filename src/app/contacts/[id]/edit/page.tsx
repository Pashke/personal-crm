import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { updateContact } from "@/app/actions";
import { BackLink } from "@/components/back-link";
import { ContactForm } from "@/components/contact-form";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { getContact, parseContactId } from "@/lib/contacts";

export const metadata: Metadata = { title: "Изменить контакт" };

export default async function EditContactPage({ params }: PageProps<"/contacts/[id]/edit">) {
  const id = parseContactId((await params).id);
  if (!id) notFound();

  const contact = await getContact(id);
  if (!contact) notFound();

  const contactHref = `/contacts/${contact.id}`;

  return (
    <div className="space-y-4">
      <BackLink href={contactHref}>{contact.name}</BackLink>
      <Card className="max-w-xl">
        <CardHeader>
          <CardTitle className="text-xl font-semibold">Изменить контакт</CardTitle>
        </CardHeader>
        <CardContent>
          <ContactForm
            action={updateContact.bind(null, contact.id)}
            initialValues={{
              name: contact.name,
              howMet: contact.howMet ?? "",
              phone: contact.phone ?? "",
              email: contact.email ?? "",
            }}
            submitLabel="Сохранить"
            cancelHref={contactHref}
          />
        </CardContent>
      </Card>
    </div>
  );
}
