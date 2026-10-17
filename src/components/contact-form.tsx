"use client";

import Link from "next/link";
import { useActionState } from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import type { ContactField, ContactFormState, ContactValues } from "@/lib/contact-schema";

type ContactFormProps = {
  action: (state: ContactFormState, formData: FormData) => Promise<ContactFormState>;
  initialValues: ContactValues;
  submitLabel: string;
  cancelHref: string;
};

const fields: {
  name: ContactField;
  label: string;
  type: "text" | "tel" | "email";
  placeholder: string;
  required?: boolean;
}[] = [
  { name: "name", label: "Имя", type: "text", placeholder: "Иван Петров", required: true },
  {
    name: "howMet",
    label: "Откуда знакомы",
    type: "text",
    placeholder: "Например: учились вместе в университете",
  },
  { name: "phone", label: "Телефон", type: "tel", placeholder: "+7 900 123-45-67" },
  { name: "email", label: "Почта", type: "email", placeholder: "ivan@example.com" },
];

export function ContactForm({ action, initialValues, submitLabel, cancelHref }: ContactFormProps) {
  const [state, formAction, pending] = useActionState(action, { values: initialValues });

  return (
    <form action={formAction} className="flex max-w-xl flex-col gap-5 md:gap-6">
      {fields.map((field) => {
        const error = state.errors?.[field.name];
        const errorId = `${field.name}-error`;
        return (
          <div key={field.name} className="flex flex-col gap-2">
            <Label htmlFor={field.name}>
              {field.label}
              {field.required && <span className="text-destructive">*</span>}
            </Label>
            <Input
              id={field.name}
              name={field.name}
              type={field.type}
              required={field.required}
              autoFocus={field.name === "name"}
              // These are someone else's details: the browser must not offer the user's own.
              autoComplete="off"
              placeholder={field.placeholder}
              defaultValue={state.values[field.name]}
              aria-invalid={error ? true : undefined}
              aria-describedby={error ? errorId : undefined}
            />
            {error && (
              <p id={errorId} className="text-meta text-destructive">
                {error}
              </p>
            )}
          </div>
        );
      })}

      {state.message && (
        <p role="alert" className="rounded-sm border border-destructive px-3.5 py-2.5 text-meta text-destructive">
          {state.message}
        </p>
      )}

      <div className="mt-1 flex flex-col gap-3 sm:flex-row">
        <Button type="submit" size="lg" disabled={pending}>
          {pending ? "Сохраняю…" : submitLabel}
        </Button>
        <Button asChild variant="outline" size="lg">
          <Link href={cancelHref}>Отмена</Link>
        </Button>
      </div>
    </form>
  );
}
