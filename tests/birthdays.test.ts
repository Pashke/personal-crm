import { describe, expect, it } from "vitest";

import { ageOn, moscowToday, nextBirthday } from "@/lib/birthdays";

// openspec birthdays: «Какой день считается сегодняшним», «Ближайший день рождения», «Возраст».
// "Today" is passed in, so no test depends on the clock.

const date = (year: number, month: number, day: number) => ({ year, month, day });
const noYear = (month: number, day: number) => ({ day, month, year: null });

describe("nextBirthday", () => {
  const today = date(2026, 11, 12);

  it("today: 0 days", () => {
    expect(nextBirthday(noYear(11, 12), today)).toMatchObject({ date: date(2026, 11, 12), days: 0 });
  });

  it("tomorrow: 1 day", () => {
    expect(nextBirthday(noYear(11, 13), today)).toMatchObject({ date: date(2026, 11, 13), days: 1 });
  });

  it("in 7 and in 8 days", () => {
    expect(nextBirthday(noYear(11, 19), today)).toMatchObject({ date: date(2026, 11, 19), days: 7 });
    expect(nextBirthday(noYear(11, 20), today)).toMatchObject({ date: date(2026, 11, 20), days: 8 });
  });

  it("yesterday: the next one is a year away", () => {
    expect(nextBirthday(noYear(11, 11), today)).toMatchObject({ date: date(2027, 11, 11), days: 364 });
  });

  it("Через новый год: on 28 December a birthday on 2 January is in 5 days", () => {
    expect(nextBirthday(noYear(1, 2), date(2026, 12, 28))).toMatchObject({ date: date(2027, 1, 2), days: 5 });
  });

  it("29 февраля в невисокосный год: on 25 February 2027 it is 28 February, in 3 days", () => {
    expect(nextBirthday(noYear(2, 29), date(2027, 2, 25))).toMatchObject({ date: date(2027, 2, 28), days: 3 });
  });

  it("29 февраля в високосный год: on 25 February 2028 it is 29 February, in 4 days", () => {
    expect(nextBirthday(noYear(2, 29), date(2028, 2, 25))).toMatchObject({ date: date(2028, 2, 29), days: 4 });
  });

  it("29 February after 28 February of a common year: the next one is in the coming leap year", () => {
    expect(nextBirthday(noYear(2, 29), date(2027, 3, 1))).toMatchObject({ date: date(2028, 2, 29), days: 365 });
  });

  it("days are whole calendar days, the spring clock change in other countries does not matter", () => {
    expect(nextBirthday(noYear(4, 1), date(2026, 3, 1))).toMatchObject({ days: 31 });
  });
});

describe("moscowToday", () => {
  it("Сразу после полуночи по Москве: 11 November 21:30 UTC is already 12 November", () => {
    expect(moscowToday(new Date("2026-11-11T21:30:00Z"))).toEqual({ year: 2026, month: 11, day: 12 });
  });

  it("20:59 UTC is still 11 November in Moscow", () => {
    expect(moscowToday(new Date("2026-11-11T20:59:00Z"))).toEqual({ year: 2026, month: 11, day: 11 });
  });

  it("the new year comes to Moscow three hours before Greenwich", () => {
    expect(moscowToday(new Date("2026-12-31T21:00:00Z"))).toEqual({ year: 2027, month: 1, day: 1 });
  });
});

describe("age", () => {
  const born = (year: number, month: number, day: number) => ({ day, month, year });

  it("День рождения сегодня: on 12 November 2026 Иван, born 12 November 1986, is 40 and turns 40", () => {
    const today = date(2026, 11, 12);
    expect(ageOn(born(1986, 11, 12), today)).toBe(40);
    expect(nextBirthday(born(1986, 11, 12), today)).toEqual({ date: today, days: 0, turning: 40 });
  });

  it("День рождения завтра: on 12 November 2026 Анна, born 13 November 1990, is 35 and will turn 36", () => {
    const today = date(2026, 11, 12);
    expect(ageOn(born(1990, 11, 13), today)).toBe(35);
    expect(nextBirthday(born(1990, 11, 13), today)).toEqual({ date: date(2026, 11, 13), days: 1, turning: 36 });
  });

  it("29 февраля в невисокосный год: on 28 February 2027 Олег, born 29 February 2000, is 27 and turns 27", () => {
    const today = date(2027, 2, 28);
    expect(ageOn(born(2000, 2, 29), today)).toBe(27);
    expect(nextBirthday(born(2000, 2, 29), today)).toEqual({ date: today, days: 0, turning: 27 });
    // The day before, still 26.
    expect(ageOn(born(2000, 2, 29), date(2027, 2, 27))).toBe(26);
  });

  it("a birthday later this year: the age of last year's birthday", () => {
    expect(ageOn(born(1990, 5, 15), date(2026, 11, 12))).toBe(36);
    expect(ageOn(born(1990, 12, 1), date(2026, 11, 12))).toBe(35);
  });

  it("under a year: 0", () => {
    expect(ageOn(born(2026, 3, 1), date(2026, 11, 12))).toBe(0);
  });

  it("without the year: no age anywhere", () => {
    expect(ageOn(noYear(11, 12), date(2026, 11, 12))).toBeNull();
    expect(nextBirthday(noYear(11, 13), date(2026, 11, 12)).turning).toBeNull();
  });
});
