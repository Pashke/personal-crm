import { describe, expect, it } from "vitest";

import { formatDueStatus, formatLastContact, frequencyLabelInline, frequencyLabels } from "@/lib/format";

import { DAY_MS } from "./setup/helpers";

// Calendar dates are local, as on the server that words these texts; noon keeps them clear of
// midnight. Spans in days are counted in milliseconds, so a clock change cannot shift them.
const local = (year: number, month: number, day: number) => new Date(year, month - 1, day, 12);
const now = local(2026, 10, 31);
const before = (ms: number) => new Date(now.getTime() - ms);

describe("formatLastContact", () => {
  it("Дни: «последний раз 21 день назад»", () => {
    expect(formatLastContact(before(21 * DAY_MS), now)).toBe("последний раз 21 день назад");
  });

  it("counts whole days and agrees the word with the number", () => {
    expect(formatLastContact(before(19 * DAY_MS + 5 * 60 * 60 * 1000), now)).toBe("последний раз 19 дней назад");
    expect(formatLastContact(before(1 * DAY_MS), now)).toBe("последний раз 1 день назад");
    expect(formatLastContact(before(2 * DAY_MS), now)).toBe("последний раз 2 дня назад");
    expect(formatLastContact(before(11 * DAY_MS), now)).toBe("последний раз 11 дней назад");
    expect(formatLastContact(before(59 * DAY_MS), now)).toBe("последний раз 59 дней назад");
  });

  it("Месяцы: 4 months and 10 days ago is «последний раз 4 месяца назад»", () => {
    expect(formatLastContact(local(2026, 6, 21), now)).toBe("последний раз 4 месяца назад");
  });

  it("switches to whole months from 60 days and keeps them under 2 years", () => {
    // 1 September → 31 October: 60 days, but only one whole month.
    expect(formatLastContact(before(60 * DAY_MS), now)).toBe("последний раз 1 месяц назад");
    expect(formatLastContact(local(2025, 10, 1), now)).toBe("последний раз 12 месяцев назад");
    expect(formatLastContact(local(2024, 11, 1), now)).toBe("последний раз 23 месяца назад");
  });

  it("Годы: 2 years and 5 months ago is «последний раз 2 года назад»", () => {
    expect(formatLastContact(local(2024, 5, 31), now)).toBe("последний раз 2 года назад");
  });

  it("counts whole years from 2 years on", () => {
    expect(formatLastContact(local(2024, 10, 31), now)).toBe("последний раз 2 года назад");
    expect(formatLastContact(local(2021, 1, 15), now)).toBe("последний раз 5 лет назад");
  });

  it("Заметок нет: «ещё не общались»", () => {
    expect(formatLastContact(null, now)).toBe("ещё не общались");
  });
});

describe("formatDueStatus", () => {
  it("Срок впереди: «следующий раз до 15 ноября» without the current year", () => {
    expect(formatDueStatus(local(2026, 11, 15), now)).toBe("следующий раз до 15 ноября");
  });

  it("Срок в следующем году: «следующий раз до 20 октября 2027»", () => {
    expect(formatDueStatus(local(2027, 10, 20), now)).toBe("следующий раз до 20 октября 2027");
  });

  it("Срок прошёл: «пора было 3 дня назад» in whole days", () => {
    expect(formatDueStatus(before(3 * DAY_MS + 2 * 60 * 60 * 1000), now)).toBe("пора было 3 дня назад");
    expect(formatDueStatus(before(1 * DAY_MS), now)).toBe("пора было 1 день назад");
    expect(formatDueStatus(before(12 * DAY_MS), now)).toBe("пора было 12 дней назад");
  });

  it("Срок наступил только что: «пора сегодня» for less than a day", () => {
    expect(formatDueStatus(now, now)).toBe("пора сегодня");
    expect(formatDueStatus(before(DAY_MS - 1), now)).toBe("пора сегодня");
  });
});

describe("frequency labels", () => {
  it("the contact page and the form: «Раз в неделю» … «Раз в год»", () => {
    expect(frequencyLabels).toEqual({
      week: "Раз в неделю",
      month: "Раз в месяц",
      quarter: "Раз в квартал",
      year: "Раз в год",
    });
  });

  it("a row of the block: «раз в неделю» in the middle of the line", () => {
    expect(frequencyLabelInline("week")).toBe("раз в неделю");
    expect(frequencyLabelInline("year")).toBe("раз в год");
  });
});
