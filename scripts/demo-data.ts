// The demo data of `pnpm db:seed` (scripts/seed.ts): realistic contacts, notes, group memberships and
// birthdays for the owner, the user with the address from OWNER_EMAIL. Only if the owner has no contacts yet,
// so real data is never mixed with demo data. A function of its own, so tests can call it.
import { randomUUID } from "node:crypto";

import { base, Faker, fakerRU as faker } from "@faker-js/faker";
import { count, eq } from "drizzle-orm";
import type { NodePgDatabase } from "drizzle-orm/node-postgres";

import { normalizeEmail } from "../src/db/email";
import * as schema from "../src/db/schema";
import { contactGroups, contacts, groups, notes, users, type ContactFrequency } from "../src/db/schema";

export const DEMO_CONTACT_COUNT = 1000;

type Sex = "male" | "female";

// Picks the word form that agrees with the contact's gender.
const g = (sex: Sex, male: string, female: string) => (sex === "male" ? male : female);

// Common modern first names: faker's Russian locale includes many archaic ones (Ярополк, Фёкла).
const firstNames: Record<Sex, string[]> = {
  male: [
    "Александр",
    "Алексей",
    "Андрей",
    "Антон",
    "Артём",
    "Борис",
    "Вадим",
    "Василий",
    "Виктор",
    "Виталий",
    "Владимир",
    "Владислав",
    "Вячеслав",
    "Глеб",
    "Григорий",
    "Денис",
    "Дмитрий",
    "Евгений",
    "Егор",
    "Иван",
    "Игорь",
    "Илья",
    "Кирилл",
    "Константин",
    "Леонид",
    "Максим",
    "Марк",
    "Матвей",
    "Михаил",
    "Никита",
    "Николай",
    "Олег",
    "Павел",
    "Пётр",
    "Роман",
    "Руслан",
    "Сергей",
    "Станислав",
    "Степан",
    "Тимур",
    "Фёдор",
    "Юрий",
    "Ярослав",
  ],
  female: [
    "Алёна",
    "Алина",
    "Алиса",
    "Анастасия",
    "Анна",
    "Арина",
    "Валентина",
    "Валерия",
    "Вера",
    "Вероника",
    "Виктория",
    "Галина",
    "Дарья",
    "Диана",
    "Екатерина",
    "Елена",
    "Елизавета",
    "Жанна",
    "Ирина",
    "Карина",
    "Кристина",
    "Ксения",
    "Лариса",
    "Любовь",
    "Людмила",
    "Маргарита",
    "Марина",
    "Мария",
    "Надежда",
    "Наталья",
    "Нина",
    "Ольга",
    "Полина",
    "Светлана",
    "София",
    "Татьяна",
    "Ульяна",
    "Юлия",
    "Яна",
  ],
};

const cities = [
  "Москве",
  "Петербурге",
  "Казани",
  "Новосибирске",
  "Екатеринбурге",
  "Нижнем Новгороде",
  "Сочи",
  "Калининграде",
  "Самаре",
  "Ярославле",
];

const movedToCities = [
  "Москву",
  "Петербург",
  "Казань",
  "Новосибирск",
  "Екатеринбург",
  "Калининград",
  "Самару",
  "Ярославль",
  "Тбилиси",
  "Белград",
];

const howMetTemplates: ((sex: Sex) => string)[] = [
  (s) => `${g(s, "Однокурсник", "Однокурсница")}, учились на одном потоке`,
  (s) => `${g(s, "Одноклассник", "Одноклассница")}, школа №${faker.number.int({ min: 1, max: 150 })}`,
  (s) => `${g(s, "Бывший коллега", "Бывшая коллега")} по прошлой работе`,
  () => "Коллега из соседнего отдела",
  () => `Познакомились на конференции в ${faker.helpers.arrayElement(cities)}`,
  (s) => `${g(s, "Сосед", "Соседка")} по дому`,
  (s) => `${g(s, "Друг", "Подруга")} детства`,
  () => `Познакомились в отпуске в ${faker.helpers.arrayElement(cities)}`,
  () => "Знакомы по спортзалу",
  () => "Друг друзей, познакомились на дне рождения",
  () => "Вместе ходили в поход на Алтай",
  () => "Знакомы по чату родителей из школы",
  () => "Познакомились на курсах английского",
  (s) => `${g(s, "Заказчик", "Заказчица")} по фрилансу, теперь просто общаемся`,
  () => "Тренер по теннису",
  () => "Познакомились на свадьбе у общих друзей",
  (s) => g(s, "Двоюродный брат", "Двоюродная сестра"),
  () => "Вместе волонтёрили в приюте для животных",
  () => "Познакомились в очереди на концерт",
  (s) => `${g(s, "Был наставником", "Была наставницей")} на стажировке`,
  () => `Встретились на митапе в ${faker.helpers.arrayElement(cities)}`,
  () => "Знакомы через жену",
  () => "Знакомы через мужа",
  (s) => `${g(s, "Попутчик", "Попутчица")} в поезде, разговорились`,
];

const topics = [
  "переезд в новую квартиру",
  "идею совместного проекта",
  "поездку на Байкал",
  "смену работы",
  "ремонт на даче",
  "детский лагерь на лето",
  "курсы по фотографии",
  "книгу, которую обоим посоветовали",
  "покупку машины",
  "подготовку к марафону",
  "планы на отпуск",
  "новое хобби — гончарное дело",
];

// Each phrase continues "договорились", including its own comma where Russian needs one.
const agreements = [
  " встретиться на следующей неделе",
  " созвониться после праздников",
  ", что я пришлю контакты юриста",
  " сходить вместе на концерт в субботу",
  ", что я помогу с резюме",
  " обменяться книгами",
  ", что встретимся на кофе в центре",
  " списаться ближе к лету",
  ", что я познакомлю с Олей из маркетинга",
  " вместе съездить на рыбалку",
];

const noteTemplates: ((sex: Sex) => string)[] = [
  () =>
    `Созвонились, обсудили ${faker.helpers.arrayElement(topics)}. Договорились${faker.helpers.arrayElement(agreements)}.`,
  (s) => `Встретились на кофе. ${g(s, "Рассказывал", "Рассказывала")} про ${faker.helpers.arrayElement(topics)}.`,
  (s) => `Созвонились в день рождения, ${g(s, "был очень рад", "была очень рада")}.`,
  (s) =>
    `${g(s, "Написал", "Написала")} сам${g(s, "", "а")}, спрашивал${g(s, "", "а")} совета про ${faker.helpers.arrayElement(topics)}.`,
  () => `Договорились${faker.helpers.arrayElement(agreements)}. Не забыть напомнить за пару дней.`,
  (s) => `Моя книга «Мастер и Маргарита» ${g(s, "у него", "у неё")} — не забыть забрать.`,
  (s) => `${g(s, "Переехал", "Переехала")} в ${faker.helpers.arrayElement(movedToCities)}, зовёт в гости.`,
  () => "Случайно встретились в торговом центре, поболтали минут десять.",
  (s) =>
    `${g(s, "Сменил", "Сменила")} работу, теперь в небольшой продуктовой компании. ${g(s, "Доволен", "Довольна")}.`,
  () => `Обсудили ${faker.helpers.arrayElement(topics)}.\nИтог: договорились${faker.helpers.arrayElement(agreements)}.`,
];

const translit: Record<string, string> = {
  а: "a",
  б: "b",
  в: "v",
  г: "g",
  д: "d",
  е: "e",
  ё: "e",
  ж: "zh",
  з: "z",
  и: "i",
  й: "y",
  к: "k",
  л: "l",
  м: "m",
  н: "n",
  о: "o",
  п: "p",
  р: "r",
  с: "s",
  т: "t",
  у: "u",
  ф: "f",
  х: "kh",
  ц: "ts",
  ч: "ch",
  ш: "sh",
  щ: "shch",
  ъ: "",
  ы: "y",
  ь: "",
  э: "e",
  ю: "yu",
  я: "ya",
};

function toLatin(value: string) {
  return [...value.toLowerCase()].map((char) => translit[char] ?? char).join("");
}

const emailDomains = ["gmail.com", "yandex.ru", "mail.ru", "bk.ru", "outlook.com", "icloud.com"];

function makeEmail(firstName: string, lastName: string, used: Set<string>) {
  const first = toLatin(firstName);
  const last = toLatin(lastName);
  const local = faker.helpers.arrayElement([
    `${first}.${last}`,
    `${first}${last}`,
    `${first[0]}.${last}`,
    `${last}.${first}`,
    `${first}${faker.number.int({ min: 70, max: 99 })}`,
  ]);
  const domain = faker.helpers.arrayElement(emailDomains);
  let email = `${local}@${domain}`;
  for (let suffix = 2; used.has(email); suffix++) email = `${local}${suffix}@${domain}`;
  used.add(email);
  return email;
}

// About a third of contacts get a frequency, mostly a month or a quarter. Contacts date back
// to 2021, so many of them are overdue at once and «Пора связаться» has rows to check.
function makeFrequency(): ContactFrequency | null {
  if (!faker.datatype.boolean({ probability: 0.33 })) return null;
  return faker.helpers.weightedArrayElement<ContactFrequency>([
    { weight: 2, value: "week" },
    { weight: 4, value: "month" },
    { weight: 3, value: "quarter" },
    { weight: 1, value: "year" },
  ]);
}

// About a third of contacts are in no group, the rest in one or two. Relatives always go to «Семья»
// and the tennis coach to «Теннис» (when those groups exist). Without any groups, nobody is in one.
function pickGroupIds(howMet: string | null, all: { id: number; name: string }[]): number[] {
  if (all.length === 0) return [];

  const idOf = (name: string) => all.find((group) => group.name === name)?.id;
  const fixed = new Set<number>();
  if (howMet?.startsWith("Двоюродн")) fixed.add(idOf("Семья") ?? 0);
  if (howMet === "Тренер по теннису") fixed.add(idOf("Теннис") ?? 0);
  fixed.delete(0);
  if (fixed.size > 0) return [...fixed];

  if (faker.datatype.boolean({ probability: 1 / 3 })) return [];
  const count = faker.number.int({ min: 1, max: Math.min(2, all.length) });
  return faker.helpers.arrayElements(all, count).map((group) => group.id);
}

// Birthdays come from a generator of their own, with its own seed: the main one makes exactly
// the same calls as before birthdays existed, so names, notes and groups stay as they were.
const birthdayFaker = new Faker({ locale: base });

type DemoBirthday = { birthDay: number; birthMonth: number; birthYear: number | null } | null;

const daysInMonth = [31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];

// How many of the first contacts with a birthday get one from today to a week ahead, so the block
// «Скоро день рождения» is filled at once and has «Показать всех».
const UPCOMING_DEMO_BIRTHDAYS = 6;

// About two thirds of contacts get a birthday, a quarter of them without the year; years 1950–2005.
// This script cannot use src/lib/ (the app image does not have it), so "the coming days" are
// counted here by the UTC date: a day's shift around midnight does not matter for demo data.
function makeBirthdays(count: number, now: Date): DemoBirthday[] {
  birthdayFaker.seed(20261112);
  let upcoming = 0;
  return Array.from({ length: count }, () => {
    if (!birthdayFaker.datatype.boolean({ probability: 2 / 3 })) return null;
    const birthYear = birthdayFaker.datatype.boolean({ probability: 0.25 })
      ? null
      : birthdayFaker.number.int({ min: 1950, max: 2005 });

    if (upcoming < UPCOMING_DEMO_BIRTHDAYS) {
      upcoming++;
      const date = new Date(now);
      date.setUTCDate(date.getUTCDate() + birthdayFaker.number.int({ min: 0, max: 7 }));
      const birthDay = date.getUTCDate();
      const birthMonth = date.getUTCMonth() + 1;
      // 29 February of a leap year is no date in the common years of birth: then without the year.
      return { birthDay, birthMonth, birthYear: birthMonth === 2 && birthDay === 29 ? null : birthYear };
    }

    const birthMonth = birthdayFaker.number.int({ min: 1, max: 12 });
    const birthDay = birthdayFaker.number.int({ min: 1, max: daysInMonth[birthMonth - 1] });
    return { birthDay, birthMonth, birthYear };
  });
}

function makePhone() {
  const digits = (n: number) => faker.string.numeric(n);
  return `+7 9${digits(2)} ${digits(3)}-${digits(2)}-${digits(2)}`;
}

type SeedOptions = {
  // OWNER_EMAIL as it is in .env; checked like the sign-in form checks an address.
  ownerEmail: string | undefined;
  count?: number;
};

// Returns what was written, or { skipped: <the owner's contacts> } when the owner already has contacts.
export async function seedDemoData(
  db: NodePgDatabase<typeof schema>,
  { ownerEmail, count: contactCount = DEMO_CONTACT_COUNT }: SeedOptions,
) {
  const email = normalizeEmail(ownerEmail);
  if (!email) throw new Error("OWNER_EMAIL is not set or is not an email address: fix it in .env");

  faker.seed(20261007);
  const now = new Date();
  const usedEmails = new Set<string>();

  return db.transaction(async (tx) => {
    // The owner, made a user if they have never signed in: their first sign-in lands in this data.
    await tx
      .insert(users)
      .values({ id: randomUUID().replace(/-/g, ""), name: "", email, emailVerified: true })
      .onConflictDoNothing({ target: users.email });
    const [owner] = await tx.select({ id: users.id }).from(users).where(eq(users.email, email));

    const [{ value: existing }] = await tx
      .select({ value: count() })
      .from(contacts)
      .where(eq(contacts.userId, owner.id));
    if (existing > 0) return { skipped: existing };

    const people = Array.from({ length: contactCount }, () => {
      const sex = faker.helpers.arrayElement<Sex>(["male", "female"]);
      const firstName = faker.helpers.arrayElement(firstNames[sex]);
      const lastName = faker.person.lastName(sex);
      const createdAt = faker.date.between({ from: "2021-01-01", to: now });
      return {
        sex,
        row: {
          userId: owner.id,
          name: `${firstName} ${lastName}`,
          howMet: faker.datatype.boolean({ probability: 0.9 })
            ? faker.helpers.arrayElement(howMetTemplates)(sex)
            : null,
          phone: faker.datatype.boolean({ probability: 0.85 }) ? makePhone() : null,
          email: faker.datatype.boolean({ probability: 0.7 }) ? makeEmail(firstName, lastName, usedEmails) : null,
          contactFrequency: makeFrequency(),
          createdAt,
          updatedAt: createdAt,
        },
      };
    });

    const birthdays = makeBirthdays(people.length, now);
    const inserted = await tx
      .insert(contacts)
      .values(people.map((person, index) => ({ ...person.row, ...birthdays[index] })))
      .returning({ id: contacts.id });

    const noteRows = inserted.flatMap(({ id }, index) => {
      const { sex, row } = people[index];
      if (!faker.datatype.boolean({ probability: 0.45 })) return [];
      return Array.from({ length: faker.number.int({ min: 1, max: 4 }) }, () => ({
        contactId: id,
        body: faker.helpers.arrayElement(noteTemplates)(sex),
        createdAt: faker.date.between({ from: row.createdAt, to: now }),
      }));
    });

    if (noteRows.length > 0) await tx.insert(notes).values(noteRows);

    // After the notes, so contacts and notes come out the same as before groups existed.
    // Only the owner's own groups.
    const ownGroups = await tx
      .select({ id: groups.id, name: groups.name })
      .from(groups)
      .where(eq(groups.userId, owner.id))
      .orderBy(groups.id);
    const memberships = inserted.flatMap(({ id }, index) =>
      pickGroupIds(people[index].row.howMet, ownGroups).map((groupId) => ({ contactId: id, groupId })),
    );
    if (memberships.length > 0) await tx.insert(contactGroups).values(memberships);

    return { contacts: inserted.length, notes: noteRows.length, memberships: memberships.length };
  });
}
