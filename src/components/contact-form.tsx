"use client";

import Link from "next/link";
import { useActionState } from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import type {
  ContactField,
  ContactFormState,
  ContactFrequencyValue,
  ContactValues,
} from "@/lib/contact-schema";
import { frequencyLabels } from "@/lib/format";

type ContactFormProps = {
  action: (state: ContactFormState, formData: FormData) => Promise<ContactFormState>;
  initialValues: ContactValues;
  submitLabel: string;
  cancelHref: string;
};

const frequencyOptions: { value: ContactFrequencyValue; label: string }[] = [
  { value: "none", label: "Не задано" },
  ...Object.entries(frequencyLabels).map(([value, label]) => ({
    value: value as ContactFrequencyValue,
    label,
  })),
];

const fields: {
  name: Exclude<ContactField, "contactFrequency">;
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

      <FrequencyField selected={state.values.contactFrequency} error={state.errors?.contactFrequency} />

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

// «Как часто общаться»: plain radio buttons drawn as a row of toggles. Plain inputs, unlike
// a Radix radio group, go back to `defaultChecked` on their own when the form is reset
// after a failed save, so the choice survives an error in another field.
function FrequencyField({ selected = "none", error }: { selected?: string; error?: string }) {
  const errorId = "contactFrequency-error";
  return (
    <fieldset className="flex min-w-0 flex-col gap-2" aria-describedby={error ? errorId : undefined}>
      <legend className="mb-2.5 font-display text-label font-medium text-accent uppercase">
        Как часто общаться
      </legend>
      <div className="flex flex-wrap gap-2">
        {frequencyOptions.map((option) => (
          <label
            key={option.value}
            className="relative inline-flex min-h-11 cursor-pointer items-center rounded-sm border-[1.5px] border-accent px-3.5 font-display text-label font-medium whitespace-nowrap text-accent uppercase transition-colors select-none not-has-checked:hover:bg-muted/40 has-checked:bg-accent has-checked:text-accent-foreground has-focus-visible:outline-2 has-focus-visible:outline-offset-2 has-focus-visible:outline-ring md:px-4"
          >
            <input
              type="radio"
              name="contactFrequency"
              value={option.value}
              defaultChecked={option.value === selected}
              className="sr-only"
            />
            {option.label}
          </label>
        ))}
      </div>
      {error && (
        <p id={errorId} className="text-meta text-destructive">
          {error}
        </p>
      )}
    </fieldset>
  );
}
