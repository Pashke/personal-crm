// Fills an empty database with realistic test contacts and notes.
// Usage: pnpm db:seed (refuses to run if contacts already exist, so real data is never mixed with test data).
import { fakerRU as faker } from "@faker-js/faker";
import { loadEnvConfig } from "@next/env";
import { count } from "drizzle-orm";
import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";

import { getDatabaseConfig } from "../src/db/config";
import { contacts, notes, type ContactFrequency } from "../src/db/schema";

const CONTACT_COUNT = 1000;

type Sex = "male" | "female";

// Picks the word form that agrees with the contact's gender.
const g = (sex: Sex, male: string, female: string) => (sex === "male" ? male : female);

// Common modern first names: faker's Russian locale includes many archaic ones (Ярополк, Фёкла).
const firstNames: Record<Sex, string[]> = {
  male: [
    "Александр", "Алексей", "Андрей", "Антон", "Артём", "Борис", "Вадим", "Василий", "Виктор",
    "Виталий", "Владимир", "Владислав", "Вячеслав", "Глеб", "Григорий", "Денис", "Дмитрий",
    "Евгений", "Егор", "Иван", "Игорь", "Илья", "Кирилл", "Константин", "Леонид", "Максим",
    "Марк", "Матвей", "Михаил", "Никита", "Николай", "Олег", "Павел", "Пётр", "Роман",
    "Руслан", "Сергей", "Станислав", "Степан", "Тимур", "Фёдор", "Юрий", "Ярослав",
  ],
  female: [
    "Алёна", "Алина", "Алиса", "Анастасия", "Анна", "Арина", "Валентина", "Валерия", "Вера",
    "Вероника", "Виктория", "Галина", "Дарья", "Диана", "Екатерина", "Елена", "Елизавета",
    "Жанна", "Ирина", "Карина", "Кристина", "Ксения", "Лариса", "Любовь", "Людмила",
    "Маргарита", "Марина", "Мария", "Надежда", "Наталья", "Нина", "Ольга", "Полина",
    "Светлана", "София", "Татьяна", "Ульяна", "Юлия", "Яна",
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
  (s) =>
    `Встретились на кофе. ${g(s, "Рассказывал", "Рассказывала")} про ${faker.helpers.arrayElement(topics)}.`,
  (s) => `Созвонились в день рождения, ${g(s, "был очень рад", "была очень рада")}.`,
  (s) =>
    `${g(s, "Написал", "Написала")} сам${g(s, "", "а")}, спрашивал${g(s, "", "а")} совета про ${faker.helpers.arrayElement(topics)}.`,
  () => `Договорились${faker.helpers.arrayElement(agreements)}. Не забыть напомнить за пару дней.`,
  (s) => `Моя книга «Мастер и Маргарита» ${g(s, "у него", "у неё")} — не забыть забрать.`,
  (s) => `${g(s, "Переехал", "Переехала")} в ${faker.helpers.arrayElement(movedToCities)}, зовёт в гости.`,
  () => "Случайно встретились в торговом центре, поболтали минут десять.",
  (s) =>
    `${g(s, "Сменил", "Сменила")} работу, теперь в небольшой продуктовой компании. ${g(s, "Доволен", "Довольна")}.`,
  () =>
    `Обсудили ${faker.helpers.arrayElement(topics)}.\nИтог: договорились${faker.helpers.arrayElement(agreements)}.`,
];

const translit: Record<string, string> = {
  а: "a", б: "b", в: "v", г: "g", д: "d", е: "e", ё: "e", ж: "zh", з: "z", и: "i", й: "y",
  к: "k", л: "l", м: "m", н: "n", о: "o", п: "p", р: "r", с: "s", т: "t", у: "u", ф: "f",
  х: "kh", ц: "ts", ч: "ch", ш: "sh", щ: "shch", ъ: "", ы: "y", ь: "", э: "e", ю: "yu", я: "ya",
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

function makePhone() {
  const digits = (n: number) => faker.string.numeric(n);
  return `+7 9${digits(2)} ${digits(3)}-${digits(2)}-${digits(2)}`;
}

async function main() {
  loadEnvConfig(process.cwd());
  faker.seed(20261007);

  const pool = new Pool(getDatabaseConfig());
  const db = drizzle(pool);

  try {
    const [{ value: existing }] = await db.select({ value: count() }).from(contacts);
    if (existing > 0) {
      console.log(`Skipped: the database already has ${existing} contacts. Seeding only runs on an empty database.`);
      return;
    }

    const now = new Date();
    const usedEmails = new Set<string>();

    const people = Array.from({ length: CONTACT_COUNT }, () => {
      const sex = faker.helpers.arrayElement<Sex>(["male", "female"]);
      const firstName = faker.helpers.arrayElement(firstNames[sex]);
      const lastName = faker.person.lastName(sex);
      const createdAt = faker.date.between({ from: "2021-01-01", to: now });
      return {
        sex,
        row: {
          name: `${firstName} ${lastName}`,
          howMet: faker.datatype.boolean({ probability: 0.9 })
            ? faker.helpers.arrayElement(howMetTemplates)(sex)
            : null,
          phone: faker.datatype.boolean({ probability: 0.85 }) ? makePhone() : null,
          email: faker.datatype.boolean({ probability: 0.7 })
            ? makeEmail(firstName, lastName, usedEmails)
            : null,
          contactFrequency: makeFrequency(),
          createdAt,
          updatedAt: createdAt,
        },
      };
    });

    await db.transaction(async (tx) => {
      const inserted = await tx
        .insert(contacts)
        .values(people.map((person) => person.row))
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
      console.log(`Seeded ${inserted.length} contacts and ${noteRows.length} notes.`);
    });
  } finally {
    await pool.end();
  }
}

main().catch((error) => {
  console.error("Seeding failed:", error);
  process.exit(1);
});
