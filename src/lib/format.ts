import type { ContactFrequency } from "@/db/schema";

// Picks the Russian plural form: 1 контакт, 2 контакта, 5 контактов.
export function pluralize(count: number, forms: [one: string, few: string, many: string]) {
  const mod10 = count % 10;
  const mod100 = count % 100;
  if (mod10 === 1 && mod100 !== 11) return forms[0];
  if (mod10 >= 2 && mod10 <= 4 && (mod100 < 12 || mod100 > 14)) return forms[1];
  return forms[2];
}

export function formatCount(count: number) {
  return count.toLocaleString("ru-RU");
}

// How many contacts a group has: "3 контакта", or "нет контактов" for an empty group.
export function formatGroupContactCount(count: number) {
  if (count === 0) return "нет контактов";
  return `${formatCount(count)} ${pluralize(count, ["контакт", "контакта", "контактов"])}`;
}

// The line under the title of the home page: the total, or «Найдено N из M» while a group is
// selected or a search is running (M is every contact).
export function formatContactsSummary({ found, total, filtered }: { found: number; total: number; filtered: boolean }) {
  if (filtered) return `Найдено ${formatCount(found)} из ${formatCount(total)}`;
  return `${formatCount(total)} ${pluralize(total, ["контакт", "контакта", "контактов"])}`;
}

// What the list says when it is empty because of the selected group or the search;
// null when there are simply no contacts (the page then invites to add the first one).
export function emptyListText({ query, groupName }: { query: string; groupName: string | null }) {
  if (query) {
    return groupName === null
      ? `Никого не нашлось по запросу «${query}»`
      : `Никого не нашлось по запросу «${query}» в группе «${groupName}»`;
  }
  return groupName === null ? null : `В группе «${groupName}» пока никого нет`;
}

// Group names in one line: "Друзья, Теннис".
export function formatGroupNames(names: string[]) {
  return names.join(", ");
}

// The text of the confirmation window before a group is deleted.
export function groupDeleteDescription(name: string, contactCount: number) {
  return contactCount > 0
    ? `Группа «${name}» будет удалена. Контакты из неё останутся — просто выйдут из группы.`
    : `Группа «${name}» будет удалена. Контактов в ней нет.`;
}

const dateTimeFormat = new Intl.DateTimeFormat("ru-RU", {
  day: "numeric",
  month: "long",
  year: "numeric",
  hour: "2-digit",
  minute: "2-digit",
});

export function formatDateTime(date: Date) {
  return dateTimeFormat.format(date);
}

// Labels for the frequencies from src/db/schema.ts, in the order the form shows them.
export const frequencyLabels: Record<ContactFrequency, string> = {
  week: "Раз в неделю",
  month: "Раз в месяц",
  quarter: "Раз в квартал",
  year: "Раз в год",
};

// The same label in the middle of a line: "Анна · раз в неделю · …".
export function frequencyLabelInline(frequency: ContactFrequency) {
  return frequencyLabels[frequency].toLowerCase();
}

const DAY_MS = 24 * 60 * 60 * 1000;

// Whole 24-hour periods from one moment to another: a note from yesterday 23:00 is
// "0 days" ago at 09:00 today.
function fullDaysBetween(from: Date, to: Date) {
  return Math.floor((to.getTime() - from.getTime()) / DAY_MS);
}

function formatDays(days: number) {
  return `${days} ${pluralize(days, ["день", "дня", "дней"])}`;
}

// Adds calendar months like Postgres does: 31 Jan + 1 month = 28/29 Feb.
function addMonths(date: Date, months: number) {
  const result = new Date(date);
  const day = result.getDate();
  result.setDate(1);
  result.setMonth(result.getMonth() + months);
  const lastDay = new Date(result.getFullYear(), result.getMonth() + 1, 0).getDate();
  result.setDate(Math.min(day, lastDay));
  return result;
}

function fullMonthsBetween(from: Date, to: Date) {
  let months = (to.getFullYear() - from.getFullYear()) * 12 + (to.getMonth() - from.getMonth());
  if (addMonths(from, months) > to) months--;
  return months;
}

// How long ago the last note was: under 60 days in days, then in whole months,
// from 2 years in whole years. No notes yet: "ещё не общались".
export function formatLastContact(lastNoteAt: Date | null, now: Date) {
  if (!lastNoteAt) return "ещё не общались";

  const days = fullDaysBetween(lastNoteAt, now);
  if (days < 60) return `последний раз ${formatDays(days)} назад`;

  const months = fullMonthsBetween(lastNoteAt, now);
  if (months < 24) return `последний раз ${months} ${pluralize(months, ["месяц", "месяца", "месяцев"])} назад`;

  const years = Math.floor(months / 12);
  return `последний раз ${years} ${pluralize(years, ["год", "года", "лет"])} назад`;
}

const dayMonthFormat = new Intl.DateTimeFormat("ru-RU", { day: "numeric", month: "long" });

// When to get in touch: "следующий раз до 15 ноября" (the year only when it is not the
// current one), or, once the due date has come, "пора было 3 дня назад" / "пора сегодня".
export function formatDueStatus(dueAt: Date, now: Date) {
  if (dueAt > now) {
    const date = dayMonthFormat.format(dueAt);
    const year = dueAt.getFullYear();
    return `следующий раз до ${year === now.getFullYear() ? date : `${date} ${year}`}`;
  }

  const days = fullDaysBetween(dueAt, now);
  return days === 0 ? "пора сегодня" : `пора было ${formatDays(days)} назад`;
}

// "Анна Соколова" → "АС": the first letters of the first two words.
export function initials(name: string) {
  return name
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((word) => Array.from(word)[0] ?? "")
    .join("")
    .toUpperCase();
}

// Splits text into parts, marking every place where a word of the search query occurs
// (case-insensitive, like the search itself), so the page can highlight it.
export function splitMatches(text: string, query: string) {
  const lower = text.toLowerCase();
  const words = query.toLowerCase().split(/\s+/).filter(Boolean);
  // Rare letters change length when lowercased: then positions would not line up, so skip.
  if (words.length === 0 || lower.length !== text.length) return [{ text, match: false }];

  const matched = new Array<boolean>(text.length).fill(false);
  for (const word of words) {
    for (let at = lower.indexOf(word); at !== -1; at = lower.indexOf(word, at + word.length)) {
      matched.fill(true, at, at + word.length);
    }
  }

  const parts: { text: string; match: boolean }[] = [];
  for (let i = 0; i < text.length; i++) {
    const last = parts.at(-1);
    if (last && last.match === matched[i]) last.text += text[i];
    else parts.push({ text: text[i], match: matched[i] });
  }
  return parts;
}
