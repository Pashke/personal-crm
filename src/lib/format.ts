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
