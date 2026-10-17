import type { Metadata } from "next";

import { createContact } from "@/app/actions";
import { BackLink } from "@/components/back-link";
import { ContactForm } from "@/components/contact-form";
import { emptyContactValues } from "@/lib/contact-schema";

export const metadata: Metadata = { title: "Новый контакт" };

export default function NewContactPage() {
  return (
    <div className="flex flex-col gap-5 md:gap-6">
      <BackLink href="/">Все контакты</BackLink>
      <h1 className="font-display text-title font-bold uppercase">Новый контакт</h1>
      <ContactForm
        action={createContact}
        initialValues={emptyContactValues}
        submitLabel="Добавить"
        cancelHref="/"
      />
    </div>
  );
}
