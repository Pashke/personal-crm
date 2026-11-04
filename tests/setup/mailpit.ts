// The mail stub's API (Mailpit from docker-compose.yml): what the app really sent.
// Search by `to:` matches a part of the address, so every test uses an address of its own.

const MAILPIT_URL = "http://127.0.0.1:8025";

export type CaughtEmail = {
  id: string;
  from: { name: string; address: string };
  to: string[];
  subject: string;
  html: string;
  text: string;
};

type SearchResult = { messages: { ID: string }[] };
type Message = {
  ID: string;
  From: { Name: string; Address: string };
  To: { Address: string }[];
  Subject: string;
  HTML: string;
  Text: string;
};

async function getJson<T>(path: string): Promise<T> {
  const response = await fetch(`${MAILPIT_URL}${path}`);
  if (!response.ok)
    throw new Error(`Mailpit answered ${response.status} to ${path}. Is it running? docker compose up -d`);
  return (await response.json()) as T;
}

// Every email to the address, the newest first.
export async function emailsTo(address: string): Promise<CaughtEmail[]> {
  const query = encodeURIComponent(`to:"${address}"`);
  const { messages } = await getJson<SearchResult>(`/api/v1/search?query=${query}`);
  const full = await Promise.all(messages.map(({ ID }) => getJson<Message>(`/api/v1/message/${ID}`)));
  return full.map((message) => ({
    id: message.ID,
    from: { name: message.From.Name, address: message.From.Address },
    to: message.To.map((item) => item.Address),
    subject: message.Subject,
    html: message.HTML,
    text: message.Text,
  }));
}

// Waits for the number of emails to the address to reach `count`, returns the newest one.
export async function waitForEmail(address: string, { count = 1, timeoutMs = 10_000 } = {}) {
  const deadline = Date.now() + timeoutMs;
  for (;;) {
    const emails = await emailsTo(address);
    if (emails.length >= count) return emails[0];
    if (Date.now() > deadline) throw new Error(`No email number ${count} to ${address} in Mailpit`);
    await new Promise((resolve) => setTimeout(resolve, 200));
  }
}

// The sign-in link of an email: the target of its «Войти» button.
export function signInLinkOf(email: { text: string }) {
  const link = email.text.match(/^Войти: (\S+)$/m)?.[1];
  if (!link) throw new Error("The email has no sign-in link");
  return link;
}

// An address nobody has used yet, so a test sees only its own emails.
export function uniqueEmail(name = "user") {
  return `${name}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}@example.com`;
}
