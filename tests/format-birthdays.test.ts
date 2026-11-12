import { describe, expect, it } from "vitest";

import { nextBirthday, type Birthday, type CalendarDate } from "@/lib/birthdays";
import { formatBirthday, formatBirthdayWhen, formatDayMonth, formatTurning, monthNamesGenitive } from "@/lib/format";

// openspec birthdays, «Строка контакта в блоке «Скоро день рождения»»: everything after the name.

const date = (year: number, month: number, day: number): CalendarDate => ({ year, month, day });

// The row of the block as the home page puts it together.
function blockLine(birthday: Birthday, today: CalendarDate) {
  const next = nextBirthday(birthday, today);
  return [formatDayMonth(next.date), formatBirthdayWhen(next.days), formatTurning(next)].filter(Boolean).join(" · ");
}

describe("the row of «Скоро день рождения»", () => {
  const today = date(2026, 11, 12);

  it("Сегодня, с годом: «12 ноября · сегодня · исполняется 40»", () => {
    expect(blockLine({ day: 12, month: 11, year: 1986 }, today)).toBe("12 ноября · сегодня · исполняется 40");
  });

  it("Завтра, с годом: «13 ноября · завтра · исполнится 36»", () => {
    expect(blockLine({ day: 13, month: 11, year: 1990 }, today)).toBe("13 ноября · завтра · исполнится 36");
  });

  it("Через несколько дней, без года: «17 ноября · через 5 дней»", () => {
    expect(blockLine({ day: 17, month: 11, year: null }, today)).toBe("17 ноября · через 5 дней");
  });

  it("Согласование слов: «через 2 дня», «через 5 дней», «через 7 дней»", () => {
    expect(formatBirthdayWhen(2)).toBe("через 2 дня");
    expect(formatBirthdayWhen(3)).toBe("через 3 дня");
    expect(formatBirthdayWhen(4)).toBe("через 4 дня");
    expect(formatBirthdayWhen(5)).toBe("через 5 дней");
    expect(formatBirthdayWhen(7)).toBe("через 7 дней");
  });

  it("«сегодня» and «завтра» instead of «через 0 дней» and «через 1 день»", () => {
    expect(formatBirthdayWhen(0)).toBe("сегодня");
    expect(formatBirthdayWhen(1)).toBe("завтра");
  });

  it("29 February in a common year: the day it is celebrated, 28 February", () => {
    expect(blockLine({ day: 29, month: 2, year: 2000 }, date(2027, 2, 25))).toBe(
      "28 февраля · через 3 дня · исполнится 27",
    );
  });
});

describe("month names", () => {
  it("in the genitive, as in a date: «15 мая»", () => {
    expect(monthNamesGenitive).toEqual([
      "января",
      "февраля",
      "марта",
      "апреля",
      "мая",
      "июня",
      "июля",
      "августа",
      "сентября",
      "октября",
      "ноября",
      "декабря",
    ]);
    expect(formatDayMonth({ day: 1, month: 1 })).toBe("1 января");
    expect(formatDayMonth({ day: 31, month: 12 })).toBe("31 декабря");
  });
});

describe("«День рождения» on the contact page", () => {
  const today = date(2026, 11, 12);

  it("С годом: «15 мая 1990 · 36 лет»", () => {
    expect(formatBirthday({ day: 15, month: 5, year: 1990 }, today)).toBe("15 мая 1990 · 36 лет");
  });

  it("Без года: «15 мая»", () => {
    expect(formatBirthday({ day: 15, month: 5, year: null }, today)).toBe("15 мая");
  });

  it("Не задано: no text, the page draws a dash", () => {
    expect(formatBirthday(null, today)).toBeNull();
  });

  it("Меньше года: «1 марта 2026» without the age", () => {
    expect(formatBirthday({ day: 1, month: 3, year: 2026 }, today)).toBe("1 марта 2026");
  });

  it("agrees the word with the age: «1 год», «2 года», «5 лет»", () => {
    expect(formatBirthday({ day: 1, month: 3, year: 2025 }, today)).toBe("1 марта 2025 · 1 год");
    expect(formatBirthday({ day: 1, month: 3, year: 2024 }, today)).toBe("1 марта 2024 · 2 года");
    expect(formatBirthday({ day: 1, month: 3, year: 2021 }, today)).toBe("1 марта 2021 · 5 лет");
    expect(formatBirthday({ day: 1, month: 3, year: 2005 }, today)).toBe("1 марта 2005 · 21 год");
    expect(formatBirthday({ day: 1, month: 3, year: 2014 }, today)).toBe("1 марта 2014 · 12 лет");
  });

  it("the date as stored: 29 February stays 29 February", () => {
    expect(formatBirthday({ day: 29, month: 2, year: 2000 }, date(2027, 3, 1))).toBe("29 февраля 2000 · 27 лет");
  });
});
