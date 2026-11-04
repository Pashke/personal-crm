import { describe, expect, it } from "vitest";

import { requestSignInLink } from "@/app/(auth)/login/actions";

import { createUser } from "./setup/factories";
import { formDataOf } from "./setup/helpers";
import { emailsTo, sentEmails } from "./setup/mail-trap";

// openspec user-auth: «Проверка почты» and «Ответ после отправки». Whether the link from the email
// lets the person in is covered by sign-in-link.test.ts.

const request = (email: string) => requestSignInLink({}, formDataOf({ email }));

describe("requestSignInLink: the address", () => {
  it("Неверный адрес: «Проверь адрес почты», no email", async () => {
    expect(await request("anna@")).toEqual({ email: "anna@", fieldError: "Проверь адрес почты" });
    expect(sentEmails).toEqual([]);
  });

  it("Пустое поле: empty or only spaces, «Проверь адрес почты», no email", async () => {
    expect(await request("")).toEqual({ email: "", fieldError: "Проверь адрес почты" });
    expect(await request("   ")).toEqual({ email: "   ", fieldError: "Проверь адрес почты" });
    expect(sentEmails).toEqual([]);
  });

  it("Запрос не из формы: «не почта» or no address at all, «Проверь адрес почты», no email", async () => {
    expect(await request("не почта")).toEqual({ email: "не почта", fieldError: "Проверь адрес почты" });
    expect(await requestSignInLink({}, new FormData())).toEqual({ email: "", fieldError: "Проверь адрес почты" });
    expect(sentEmails).toEqual([]);
  });
});

describe("requestSignInLink: the answer after sending", () => {
  it("Новая почта: «Ссылка для входа отправлена на <почта>», one email", async () => {
    expect(await request("anna@example.com")).toEqual({ email: "anna@example.com", sentTo: "anna@example.com" });

    expect(emailsTo("anna@example.com")).toHaveLength(1);
    expect(emailsTo("anna@example.com")[0].subject).toBe("Вход в Личную CRM");
    expect(sentEmails).toHaveLength(1);
  });

  it("Знакомая почта: the same answer as for a new one", async () => {
    await createUser("ivan@example.com");

    expect(await request("ivan@example.com")).toEqual({ email: "ivan@example.com", sentTo: "ivan@example.com" });
    expect(emailsTo("ivan@example.com")).toHaveLength(1);
  });

  it("Пробелы и большие буквы: the email goes to the address as the server keeps it", async () => {
    expect(await request(" Anna@Example.COM ")).toEqual({ email: " Anna@Example.COM ", sentTo: "anna@example.com" });

    expect(sentEmails.map((email) => email.to)).toEqual(["anna@example.com"]);
  });
});
