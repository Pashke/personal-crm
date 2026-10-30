"use client";

import Link from "next/link";
import { useActionState, useRef, useState } from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import type { ContactField, ContactFormState, ContactFrequencyValue, ContactValues } from "@/lib/contact-schema";
import { frequencyLabels } from "@/lib/format";
import { addPendingGroup } from "@/lib/pending-group";

type GroupOption = { id: number; name: string };

type ContactFormProps = {
  action: (state: ContactFormState, formData: FormData) => Promise<ContactFormState>;
  initialValues: ContactValues;
  // Every existing group, in the common order.
  groups: GroupOption[];
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
  name: Exclude<ContactField, "contactFrequency" | "groupIds" | "newGroups">;
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

export function ContactForm({ action, initialValues, groups, submitLabel, cancelHref }: ContactFormProps) {
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

      <GroupsField
        groups={groups}
        checkedIds={state.values.groupIds ?? []}
        initialPending={state.values.newGroups ?? []}
        error={state.errors?.newGroups}
      />

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
      <legend className="mb-2.5 font-display text-label font-medium text-accent uppercase">Как часто общаться</legend>
      <div className="flex flex-wrap gap-2">
        {frequencyOptions.map((option) => (
          <label key={option.value} className="toggle">
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

// «Группы»: every group is a toggle. Plain checkboxes, like the radio buttons above, go back to
// `defaultChecked` on their own when the form is reset after a failed save, so ticks survive an
// error in another field. A new group typed here is only remembered until the contact is saved:
// the server creates it then, so «Отмена» leaves no trace.
function GroupsField({
  groups,
  checkedIds,
  initialPending,
  error,
}: {
  groups: GroupOption[];
  checkedIds: string[];
  initialPending: string[];
  error?: string;
}) {
  const [pending, setPending] = useState(initialPending);
  const [typed, setTyped] = useState("");
  const [addError, setAddError] = useState<string>();
  const fieldsetRef = useRef<HTMLFieldSetElement>(null);
  const shownError = addError ?? error;
  const errorId = "groups-error";

  function add() {
    const result = addPendingGroup(typed, groups, pending);
    if ("error" in result) {
      setAddError(result.error);
      return;
    }
    setAddError(undefined);
    setPending(result.pending);
    setTyped("");
    if (result.checkGroupId !== null) {
      const box = fieldsetRef.current?.querySelector<HTMLInputElement>(
        `input[name="groupIds"][value="${result.checkGroupId}"]`,
      );
      if (box) box.checked = true;
    }
  }

  return (
    <fieldset
      ref={fieldsetRef}
      className="flex min-w-0 flex-col gap-2"
      aria-describedby={shownError ? errorId : undefined}
    >
      <legend className="mb-2.5 font-display text-label font-medium text-accent uppercase">Группы</legend>
      {(groups.length > 0 || pending.length > 0) && (
        <div className="flex flex-wrap gap-2">
          {groups.map((group) => (
            <label key={group.id} className="toggle">
              <input
                type="checkbox"
                name="groupIds"
                value={group.id}
                defaultChecked={checkedIds.includes(String(group.id))}
                className="sr-only"
              />
              {group.name}
            </label>
          ))}
          {pending.map((name) => (
            <label key={name} className="toggle">
              {/* Ticked off, the new group disappears: it was never created */}
              <input
                type="checkbox"
                name="newGroups"
                value={name}
                checked
                onChange={() => setPending(pending.filter((item) => item !== name))}
                className="sr-only"
              />
              {name}
            </label>
          ))}
        </div>
      )}

      <div className="mt-1 flex gap-3">
        <Input
          type="text"
          value={typed}
          onChange={(event) => {
            setTyped(event.target.value);
            setAddError(undefined);
          }}
          onKeyDown={(event) => {
            // Enter adds the group; it must not send the whole form.
            if (event.key === "Enter") {
              event.preventDefault();
              add();
            }
          }}
          autoComplete="off"
          placeholder="Новая группа"
          aria-label="Новая группа"
          aria-invalid={shownError ? true : undefined}
        />
        <Button type="button" variant="outline" onClick={add} className="h-11.5 shrink-0 md:h-13.5">
          Добавить
        </Button>
      </div>
      {shownError && (
        <p id={errorId} className="text-meta text-destructive">
          {shownError}
        </p>
      )}
    </fieldset>
  );
}
