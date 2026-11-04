import { describe, expect, it } from "vitest";

import { signInEmail } from "@/lib/sign-in-email";

// openspec user-auth, «Письмо для входа» and «Оформление письма»: the content of the email.
// Delivery through the mail stub is covered by mail.test.ts.

const url = "http://localhost:3000/api/auth/magic-link/verify?token=abc123&callbackURL=%2F";

const texts = [
  "Вход в Личную CRM",
  "Нажмите кнопку, чтобы войти. Ссылка работает 15 минут и только один раз.",
  "Кнопка не открывается? Скопируйте ссылку в браузер:",
  "Если вы не запрашивали вход - просто проигнорируйте письмо",
  "Личная CRM · app.whobook.ru",
];

function decodeEntities(html: string) {
  return html
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&amp;/g, "&");
}

// What a reader sees: the text of the body, tags removed, spaces collapsed.
function bodyText(html: string) {
  const body = html.slice(html.indexOf("<body"));
  return decodeEntities(body.replace(/<[^>]+>/g, " "))
    .replace(/\s+/g, " ")
    .trim();
}

// The addresses of all links, in the order they appear.
function linkTargets(html: string) {
  return [...html.matchAll(/<a\s[^>]*href="([^"]*)"/g)].map((match) => decodeEntities(match[1]));
}

describe("sign-in email", () => {
  it("Письмо пришло: sender «Личная CRM» <noreply@mail.crm.whobook.ru>, subject and every text", () => {
    const email = signInEmail(url);

    expect(email.from).toBe('"Личная CRM" <noreply@mail.crm.whobook.ru>');
    expect(email.subject).toBe("Вход в Личную CRM");
    const text = bodyText(email.html);
    for (const phrase of texts) expect(text).toContain(phrase);
  });

  it("Письмо пришло: the «Войти» button and the fallback line lead to the sign-in link", () => {
    const { html } = signInEmail(url);

    const button = html.match(/<a\s[^>]*href="([^"]*)"[^>]*>\s*Войти\s*<\/a>/);
    expect(button).not.toBeNull();
    expect(decodeEntities(button![1])).toBe(url);
    expect(linkTargets(html)).toEqual([url, url]);
    expect(bodyText(html)).toContain(`Кнопка не открывается? Скопируйте ссылку в браузер: ${url}`);
  });

  it("Превью во входящих: a hidden line at the very start of the email", () => {
    const { html } = signInEmail(url);

    expect(bodyText(html).startsWith("Ссылка для входа работает 15 минут")).toBe(true);
    const preview = html.match(/<div\s+style="([^"]*)"[^>]*>\s*Ссылка для входа работает 15 минут/);
    expect(preview).not.toBeNull();
    expect(preview![1]).toContain("display:none");
  });

  it("Оформление письма: forest background, gold double frame, rust button, as the mockup", () => {
    const { html } = signInEmail(url);

    expect(html).toContain('bgcolor="#24392f"');
    expect(html).toContain("background-color:#24392f");
    expect(html).toContain("border:2px solid #e6c46a");
    expect(html).toContain("border:1px solid #e6c46a");
    expect(html).toContain('bgcolor="#b84a27"');
    expect(html).toMatch(/max-width:600px/);
  });

  it("Текстовая версия: the same words and the sign-in link as plain text", () => {
    const { text } = signInEmail(url);

    for (const phrase of [...texts, "Войти"]) expect(text).toContain(phrase);
    expect(text).toContain(url);
    expect(text).not.toMatch(/<[a-z]/i);
  });

  // Whether that link lets the person in is checked in sign-in-link.test.ts.
  it("Ссылка текстом: the fallback line and the plain text carry the same link as the button", () => {
    const { html, text } = signInEmail(url);

    const [button, fallback] = linkTargets(html);
    const fallbackText = bodyText(html).split("Скопируйте ссылку в браузер: ")[1].split(" ")[0];
    const plainLinks = text.match(/https?:\/\/\S+/g);

    expect(fallback).toBe(button);
    expect(fallbackText).toBe(button);
    expect(plainLinks).not.toBeNull();
    expect(new Set(plainLinks)).toEqual(new Set([button]));
  });

  it("the link is escaped in the HTML", () => {
    const tricky = 'http://localhost:3000/api/auth/magic-link/verify?token=a&b="><script>x</script>';

    const { html } = signInEmail(tricky);

    expect(html).not.toContain("<script>");
    expect(html).not.toContain('b="');
    expect(linkTargets(html)).toEqual([tricky, tricky]);
  });
});
