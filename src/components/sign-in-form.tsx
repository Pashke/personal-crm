"use client";

import { Check } from "lucide-react";
import { useActionState } from "react";

import { requestSignInLink } from "@/app/(auth)/login/actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

// The form of the «Вход» panel. It stays in place after sending, so the address can be fixed or
// the link requested again; the typed address stays in the field either way.
// The browser does not check the address itself (noValidate): the server does, for every request.
export function SignInForm() {
  const [state, formAction, pending] = useActionState(requestSignInLink, {});

  return (
    <form action={formAction} noValidate className="flex flex-col gap-4">
      <div className="flex flex-col gap-2">
        <Label htmlFor="sign-in-email">Почта</Label>
        <Input
          id="sign-in-email"
          name="email"
          type="email"
          autoComplete="email"
          placeholder="you@example.com"
          defaultValue={state.email}
          aria-invalid={state.fieldError ? true : undefined}
          aria-describedby={state.fieldError ? "sign-in-email-error" : undefined}
        />
        {state.fieldError && (
          <p id="sign-in-email-error" role="alert" className="text-meta text-destructive">
            {state.fieldError}
          </p>
        )}
      </div>
      <Button type="submit" size="lg" disabled={pending} className="w-full">
        Получить ссылку
      </Button>
      {state.sentTo && (
        <div role="status" className="flex items-start gap-3 rounded-md border border-accent px-4 py-3.5">
          <Check aria-hidden className="mt-0.5 size-5.5 shrink-0 text-accent" />
          <p className="wrap-anywhere">
            Ссылка для входа отправлена на <b>{state.sentTo}</b>
          </p>
        </div>
      )}
      {state.formError && (
        <p role="alert" className="text-meta text-destructive">
          {state.formError}
        </p>
      )}
    </form>
  );
}
