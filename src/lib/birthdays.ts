// Birthdays are counted by calendar dates, without the time of day: "today", "tomorrow" and
// "in 5 days" do not depend on the hour the home page is opened. "Today" is the date in Moscow
// for every user. No database here and no server-only: pages, validation and tests share it.

// A day of the calendar; month 1–12.
export type CalendarDate = { year: number; month: number; day: number };

// A contact's birthday as it is stored: the year may be unknown.
export type Birthday = { day: number; month: number; year: number | null };

export type NextBirthday = {
  // The day it is celebrated: today or later.
  date: CalendarDate;
  // From today to that day: 0 is today, 1 is tomorrow.
  days: number;
  // How old the person turns that day; null without the year of birth.
  turning: number | null;
};

const DAY_MS = 24 * 60 * 60 * 1000;

// Calendar days from one date to another. Both are taken at UTC midnight, where every day
// has 24 hours, so a clock change cannot make a day longer or shorter.
function daysBetween(from: CalendarDate, to: CalendarDate) {
  return Math.round((utcMidnight(to) - utcMidnight(from)) / DAY_MS);
}

function utcMidnight({ year, month, day }: CalendarDate) {
  return Date.UTC(year, month - 1, day);
}

function isLeapYear(year: number) {
  return (year % 4 === 0 && year % 100 !== 0) || year % 400 === 0;
}

// The day the birthday falls on in the given year: someone born on 29 February celebrates
// on 28 February in a common year.
function birthdayIn(year: number, { day, month }: Birthday): CalendarDate {
  if (month === 2 && day === 29 && !isLeapYear(year)) return { year, month: 2, day: 28 };
  return { year, month, day };
}

// Full years on the given day: the year is added on the birthday itself (on 28 February in a
// common year for someone born on 29 February). Null without the year of birth.
export function ageOn(birthday: Birthday, today: CalendarDate): number | null {
  if (birthday.year === null) return null;
  const age = today.year - birthday.year;
  return daysBetween(today, birthdayIn(today.year, birthday)) > 0 ? age - 1 : age;
}

// The nearest birthday: today, if the date matches, otherwise the next day with that day and
// month, next year included.
export function nextBirthday(birthday: Birthday, today: CalendarDate): NextBirthday {
  let date = birthdayIn(today.year, birthday);
  if (daysBetween(today, date) < 0) date = birthdayIn(today.year + 1, birthday);
  return {
    date,
    days: daysBetween(today, date),
    turning: birthday.year === null ? null : date.year - birthday.year,
  };
}

const moscowDateFormat = new Intl.DateTimeFormat("en-US", {
  timeZone: "Europe/Moscow",
  year: "numeric",
  month: "numeric",
  day: "numeric",
});

// Today's date in Moscow at the given moment.
export function moscowToday(now: Date): CalendarDate {
  const parts = Object.fromEntries(
    moscowDateFormat.formatToParts(now).map((part) => [part.type, part.value] as const),
  ) as Record<Intl.DateTimeFormatPartTypes, string>;
  return { year: Number(parts.year), month: Number(parts.month), day: Number(parts.day) };
}

// The birthday as the form sends it: the day and the month from the lists, the year typed.
// An empty value is "not given".
export type BirthdayInput = { birthDay: string; birthMonth: string; birthYear: string };

export type BirthdayCheck = { birthday: Birthday | null; error?: undefined } | { birthday?: undefined; error: string };

const daysInMonth = [31, 29, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];

// A day or a month as one of the list's values: a whole number from 1 to `max`.
function parseListValue(value: string, max: number) {
  if (!/^\d{1,2}$/.test(value)) return null;
  const number = Number(value);
  return number >= 1 && number <= max ? number : null;
}

// Checks the birthday of the contact form, a forged request included, against today's date.
// Returns the birthday to save (null when none is given) or the one error for the whole field.
// Messages are shown to the user, so they are in Russian.
export function checkBirthday(input: BirthdayInput, today: CalendarDate): BirthdayCheck {
  const dayText = input.birthDay.trim();
  const monthText = input.birthMonth.trim();
  const yearText = input.birthYear.trim();

  // 1. Each part on its own: a value from the list, a year of four digits.
  const day = dayText === "" ? null : parseListValue(dayText, 31);
  const month = monthText === "" ? null : parseListValue(monthText, 12);
  if ((dayText !== "" && day === null) || (monthText !== "" && month === null)) return { error: "Проверьте дату" };
  if (yearText !== "" && !/^\d{4}$/.test(yearText)) return { error: "Проверьте год" };
  const year = yearText === "" ? null : Number(yearText);

  // 2. Together: a day and a month, the year only with them.
  if (day === null || month === null) {
    return day === null && month === null && year === null ? { birthday: null } : { error: "Укажите день и месяц" };
  }

  // 3. Such a date exists: no 31 April; 29 February only in a leap year or without a year.
  const lastDay = month === 2 && year !== null && !isLeapYear(year) ? 28 : daysInMonth[month - 1];
  if (day > lastDay) return { error: "Такой даты нет" };

  // 4. A real year, and not later than today.
  if (year !== null && year < 1900) return { error: "Проверьте год" };
  if (year !== null && daysBetween(today, { year, month, day }) > 0) {
    return { error: "Дата рождения не может быть в будущем" };
  }

  return { birthday: { day, month, year } };
}
