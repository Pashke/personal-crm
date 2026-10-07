import type { Metadata } from "next";

import { createContact } from "@/app/actions";
import { BackLink } from "@/components/back-link";
import { ContactForm } from "@/components/contact-form";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { emptyContactValues } from "@/lib/contact-schema";

export const metadata: Metadata = { title: "Новый контакт" };

export default function NewContactPage() {
  return (
    <div className="space-y-4">
      <BackLink href="/">Все контакты</BackLink>
      <Card className="max-w-xl">
        <CardHeader>
          <CardTitle className="text-xl font-semibold">Новый контакт</CardTitle>
        </CardHeader>
        <CardContent>
          <ContactForm
            action={createContact}
            initialValues={emptyContactValues}
            submitLabel="Добавить"
            cancelHref="/"
          />
        </CardContent>
      </Card>
    </div>
  );
}
