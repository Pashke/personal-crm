import { describe, expect, it } from "vitest";

import { createContact, updateContact } from "@/app/actions";
import { getDb } from "@/db";
import { contacts } from "@/db/schema";
import { checkBirthday, moscowToday } from "@/lib/birthdays";
import { emptyContactValues } from "@/lib/contact-schema";

import { contactRow, createContactRow } from "./setup/factories";
import { formDataOf, redirectTarget } from "./setup/helpers";

// openspec birthdays, «Дата рождения у контакта» and «Проверка даты рождения на сервере».
// The form sends the day, the month and the year as text, like the browser does.

const initial = { values: emptyContactValues };

const birthdayOf = async (id: number) => {
  const { birthDay, birthMonth, birthYear } = await contactRow(id);
  return { birthDay, birthMonth, birthYear };
};

async function createWith(fields: Record<string, string>) {
  const target = await redirectTarget(() => createContact(initial, formDataOf({ name: "Анна", ...fields })));
  return Number(target.replace("/?added=", ""));
}

async function updateWith(id: number, fields: Record<string, string>) {
  return redirectTarget(() => updateContact(id, initial, formDataOf({ name: "Анна", ...fields })));
}

describe("birthday saved with the contact", () => {
  it("Полная дата: 15 May 1990", async () => {
    const id = await createWith({ birthDay: "15", birthMonth: "5", birthYear: "1990" });

    expect(await birthdayOf(id)).toEqual({ birthDay: 15, birthMonth: 5, birthYear: 1990 });
  });

  it("Без года: 15 May, the year left empty", async () => {
    const id = await createWith({ birthDay: "15", birthMonth: "5", birthYear: "" });

    expect(await birthdayOf(id)).toEqual({ birthDay: 15, birthMonth: 5, birthYear: null });
  });

  it("Не указана: the field untouched, or not sent at all", async () => {
    const untouched = await createWith({ birthDay: "", birthMonth: "", birthYear: "" });
    const notSent = await createWith({});

    expect(await birthdayOf(untouched)).toEqual({ birthDay: null, birthMonth: null, birthYear: null });
    expect(await birthdayOf(notSent)).toEqual({ birthDay: null, birthMonth: null, birthYear: null });
  });

  it("spaces around the year do not matter", async () => {
    const id = await createWith({ birthDay: "15", birthMonth: "5", birthYear: " 1990 " });

    expect(await birthdayOf(id)).toEqual({ birthDay: 15, birthMonth: 5, birthYear: 1990 });
  });

  it("Смена даты: 15 May 1990 → 20 June without the year", async () => {
    const anna = await createContactRow({ name: "Анна", birthDay: 15, birthMonth: 5, birthYear: 1990 });

    expect(await updateWith(anna.id, { birthDay: "20", birthMonth: "6", birthYear: "" })).toBe(`/contacts/${anna.id}`);

    expect(await birthdayOf(anna.id)).toEqual({ birthDay: 20, birthMonth: 6, birthYear: null });
  });

  it("Стереть дату: the day, the month and the year emptied", async () => {
    const anna = await createContactRow({ name: "Анна", birthDay: 15, birthMonth: 5, birthYear: 1990 });

    await updateWith(anna.id, { birthDay: "", birthMonth: "", birthYear: "" });

    expect(await birthdayOf(anna.id)).toEqual({ birthDay: null, birthMonth: null, birthYear: null });
  });

  it("29 февраля без года: saved", async () => {
    const id = await createWith({ birthDay: "29", birthMonth: "2", birthYear: "" });

    expect(await birthdayOf(id)).toEqual({ birthDay: 29, birthMonth: 2, birthYear: null });
  });

  it("an edit of other fields keeps the birthday that the form sends back", async () => {
    const anna = await createContactRow({ name: "Анна", birthDay: 15, birthMonth: 5, birthYear: 1990 });

    await updateWith(anna.id, { phone: "+7 900 123-45-67", birthDay: "15", birthMonth: "5", birthYear: "1990" });

    expect(await birthdayOf(anna.id)).toEqual({ birthDay: 15, birthMonth: 5, birthYear: 1990 });
  });
});

describe("birthday checked on the server", () => {
  // A new contact with the given birthday and a few other fields: nothing may be saved, the error
  // goes under «День рождения», and every value comes back to the form as it was sent.
  async function expectRefused(
    birthday: { birthDay?: string; birthMonth?: string; birthYear?: string },
    error: string,
  ) {
    const sent = {
      name: "Анна Соколова",
      phone: "+7 900 123-45-67",
      contactFrequency: "month",
      birthDay: "",
      birthMonth: "",
      birthYear: "",
      ...birthday,
    };

    const result = await createContact(initial, formDataOf(sent));

    expect(result.errors).toEqual({ birthday: error });
    expect(result.values).toMatchObject(sent);
    expect(await getDb().select().from(contacts)).toEqual([]);
  }

  it("Только день: «Укажите день и месяц»", async () => {
    await expectRefused({ birthDay: "15" }, "Укажите день и месяц");
  });

  it("a month without a day: «Укажите день и месяц»", async () => {
    await expectRefused({ birthMonth: "5", birthYear: "1990" }, "Укажите день и месяц");
  });

  it("Год без дня и месяца: «Укажите день и месяц»", async () => {
    await expectRefused({ birthYear: "1990" }, "Укажите день и месяц");
  });

  it("Такой даты нет: 31 April", async () => {
    await expectRefused({ birthDay: "31", birthMonth: "4" }, "Такой даты нет");
  });

  it("29 февраля в невисокосный год: 29 February 1990", async () => {
    await expectRefused({ birthDay: "29", birthMonth: "2", birthYear: "1990" }, "Такой даты нет");
  });

  it("29 February of a leap year is a date", async () => {
    const id = await createWith({ birthDay: "29", birthMonth: "2", birthYear: "2000" });

    expect(await birthdayOf(id)).toEqual({ birthDay: 29, birthMonth: 2, birthYear: 2000 });
  });

  it("Неверный год: 1899", async () => {
    await expectRefused({ birthDay: "15", birthMonth: "5", birthYear: "1899" }, "Проверьте год");
  });

  it("Неверный год: «19а0», and a year not of four digits", async () => {
    await expectRefused({ birthDay: "15", birthMonth: "5", birthYear: "19а0" }, "Проверьте год");
    await expectRefused({ birthDay: "15", birthMonth: "5", birthYear: "90" }, "Проверьте год");
    await expectRefused({ birthDay: "15", birthMonth: "5", birthYear: "19900" }, "Проверьте год");
  });

  it("Дата в будущем: tomorrow by Moscow time", async () => {
    const today = moscowToday(new Date());
    const tomorrow = new Date(Date.UTC(today.year, today.month - 1, today.day + 1));

    await expectRefused(
      {
        birthDay: String(tomorrow.getUTCDate()),
        birthMonth: String(tomorrow.getUTCMonth() + 1),
        birthYear: String(tomorrow.getUTCFullYear()),
      },
      "Дата рождения не может быть в будущем",
    );
  });

  it("born today by Moscow time: saved", async () => {
    const today = moscowToday(new Date());

    const id = await createWith({
      birthDay: String(today.day),
      birthMonth: String(today.month),
      birthYear: String(today.year),
    });

    expect(await birthdayOf(id)).toEqual({ birthDay: today.day, birthMonth: today.month, birthYear: today.year });
  });

  it("Подменённые значения: day 45, month «abc», or a day that is not a whole number", async () => {
    await expectRefused({ birthDay: "45", birthMonth: "5" }, "Проверьте дату");
    await expectRefused({ birthDay: "15", birthMonth: "abc" }, "Проверьте дату");
    await expectRefused({ birthDay: "0", birthMonth: "5" }, "Проверьте дату");
    await expectRefused({ birthDay: "1.5", birthMonth: "5" }, "Проверьте дату");
    await expectRefused({ birthDay: "15", birthMonth: "13" }, "Проверьте дату");
  });

  it("an error in the name and in the birthday come together, the values stay", async () => {
    const sent = { name: "  ", birthDay: "31", birthMonth: "4", birthYear: "1990" };

    const result = await createContact(initial, formDataOf(sent));

    expect(result.errors).toEqual({ name: "Укажите имя", birthday: "Такой даты нет" });
    expect(result.values).toMatchObject(sent);
  });

  it("an edit with a wrong birthday is not saved, the contact stays as it was", async () => {
    const anna = await createContactRow({ name: "Анна", birthDay: 15, birthMonth: 5, birthYear: 1990 });
    const before = await contactRow(anna.id);

    const result = await updateContact(
      anna.id,
      initial,
      formDataOf({ name: "Анна Соколова", birthDay: "31", birthMonth: "4", birthYear: "1990" }),
    );

    expect(result.errors).toEqual({ birthday: "Такой даты нет" });
    expect(result.values).toMatchObject({ name: "Анна Соколова", birthDay: "31", birthMonth: "4", birthYear: "1990" });
    expect(await contactRow(anna.id)).toEqual(before);
  });
});

describe("checkBirthday", () => {
  const today = { year: 2026, month: 11, day: 12 };
  const check = (birthDay: string, birthMonth: string, birthYear: string) =>
    checkBirthday({ birthDay, birthMonth, birthYear }, today);

  it("Дата в будущем: on 12 November 2026, 20 November 2026 is refused", () => {
    expect(check("20", "11", "2026")).toEqual({ error: "Дата рождения не может быть в будущем" });
    expect(check("12", "11", "2026")).toEqual({ birthday: { day: 12, month: 11, year: 2026 } });
    expect(check("20", "11", "2025")).toEqual({ birthday: { day: 20, month: 11, year: 2025 } });
  });

  it("without the year a date is never in the future", () => {
    expect(check("20", "11", "")).toEqual({ birthday: { day: 20, month: 11, year: null } });
  });

  it("nothing given: no birthday", () => {
    expect(check("", "", "")).toEqual({ birthday: null });
  });

  it("year 1900 is the earliest one", () => {
    expect(check("1", "1", "1900")).toEqual({ birthday: { day: 1, month: 1, year: 1900 } });
  });
});
