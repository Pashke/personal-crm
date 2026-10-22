import { z } from "zod";

import { contactFrequencies } from "@/db/schema";

// "none" is the form's "Не задано"; it is stored as NULL.
export const contactFrequencyValues = ["none", ...contactFrequencies] as const;
export type ContactFrequencyValue = (typeof contactFrequencyValues)[number];

// Messages are shown to the user, so they are in Russian.
export const contactSchema = z.object({
  name: z.string().trim().min(1, "Укажите имя").max(200, "Слишком длинное имя"),
  howMet: z.string().trim().max(500, "Слишком длинный текст"),
  phone: z
    .string()
    .trim()
    .max(50, "Слишком длинный номер")
    .regex(/^[\d\s()+\-]*$/, "В телефоне могут быть только цифры, пробелы, +, - и скобки"),
  email: z
    .string()
    .trim()
    .max(200, "Слишком длинный адрес")
    .refine((value) => value === "" || z.email().safeParse(value).success, {
      message: "Похоже, в адресе почты ошибка",
    }),
  // Read as plain text, so a value forged in the browser comes back to the form as typed.
  contactFrequency: z
    .string()
    .default("none")
    .pipe(z.enum(contactFrequencyValues, { error: "Выберите один из вариантов" })),
});

export const noteSchema = z.object({
  body: z.string().trim().min(1, "Заметка пустая").max(10_000, "Слишком длинная заметка"),
});

export type ContactValues = z.input<typeof contactSchema>;
export type ContactField = keyof ContactValues;

export const emptyContactValues: ContactValues = {
  name: "",
  howMet: "",
  phone: "",
  email: "",
  contactFrequency: "none",
};

export type ContactFormState = {
  values: ContactValues;
  errors?: Partial<Record<ContactField, string>>;
  message?: string;
};

export type NoteFormState = {
  error?: string;
  // The submitted text, returned on failure so the form can show it again after React resets it.
  body?: string;
  // Changes on every successful save so the form can react to it.
  savedAt?: number;
};

// A quick note from «Пора связаться»: the new note's id (for «Отменить») or an error.
export type LogContactResult = { noteId: number; error?: undefined } | { noteId?: undefined; error: string };

export type UndoContactLogResult = {
  error?: string;
};

// A successful delete redirects to the list, so only a failure comes back as state.
export type DeleteContactState = {
  error?: string;
};
