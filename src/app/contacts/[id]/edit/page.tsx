import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { updateContact } from "@/app/actions";
import { BackLink } from "@/components/back-link";
import { ContactForm } from "@/components/contact-form";
import { getContact, parseContactId } from "@/lib/contacts";

export const metadata: Metadata = { title: "Изменить контакт" };

export default async function EditContactPage({ params }: PageProps<"/contacts/[id]/edit">) {
  const id = parseContactId((await params).id);
  if (!id) notFound();

  const contact = await getContact(id);
  if (!contact) notFound();

  const contactHref = `/contacts/${contact.id}`;

  return (
    <div className="flex flex-col gap-5 md:gap-6">
      <BackLink href={contactHref}>{contact.name}</BackLink>
      <h1 className="font-display text-title font-bold uppercase">Изменить контакт</h1>
      <ContactForm
        action={updateContact.bind(null, contact.id)}
        initialValues={{
          name: contact.name,
          howMet: contact.howMet ?? "",
          phone: contact.phone ?? "",
          email: contact.email ?? "",
          contactFrequency: contact.contactFrequency ?? "none",
        }}
        submitLabel="Сохранить"
        cancelHref={contactHref}
      />
    </div>
  );
}
