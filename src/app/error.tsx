"use client";

import { LoadError } from "@/components/load-error";

// A failure outside the pages after signing in: the sign-in pages, or the check of the user
// in the (app) layout. It replaces the header too, so the error comes in a <main> of its own.
export default function ErrorPage(props: { error: Error & { digest?: string }; retry: () => void }) {
  return (
    <main className="flex-1">
      <LoadError {...props} />
    </main>
  );
}
