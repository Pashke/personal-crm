import type { Metadata } from "next";
import { redirect } from "next/navigation";

import { SignInForm } from "@/components/sign-in-form";
import { getCurrentUser } from "@/lib/session";

export const metadata: Metadata = { title: "Вход" };

// The sign-in page, variant «Б. Обложка» of the mockup (https://claude.ai/artifact/ToG5gdWDXejyzR6etkFsKR):
// what the app is about on the left, the «Вход» panel on the right. The row wraps, so on a narrow
// screen the panel goes under the texts by itself.
export default async function SignInPage() {
  // Already signed in: straight to the home page.
  if (await getCurrentUser()) redirect("/");

  return (
    <div className="flex flex-1 flex-wrap items-center gap-x-16 gap-y-9 pt-2 pb-8">
      <div className="flex min-w-0 grow basis-90 flex-col gap-4.5">
        <h1 className="font-display text-cover font-bold text-balance uppercase">Люди, которых знаю лично</h1>
        <p className="max-w-[30em] text-lead text-muted-dark">
          Кто это, откуда знакомы, о чём договорились — в одном месте.
        </p>
        <p className="mt-1.5 origin-left -rotate-2 font-hand text-tagline font-medium text-accent">
          чтобы не терять людей и контекст общения
        </p>
      </div>

      <section
        aria-labelledby="sign-in-title"
        className="flex max-w-110 min-w-0 grow basis-80 flex-col gap-4 rounded-md border bg-muted/22 p-5 md:p-8"
      >
        <div className="flex flex-col gap-1">
          <h2 id="sign-in-title" className="font-display text-heading font-bold uppercase">
            Вход
          </h2>
          <p className="text-meta text-muted-foreground">Пароль не нужен — пришлём ссылку на почту.</p>
        </div>
        <SignInForm />
        <p className="text-meta text-muted-foreground">Ссылка работает 15 минут.</p>
      </section>
    </div>
  );
}
