"use client";

import { LoadError } from "@/components/load-error";

// A page after signing in failed: the header of the (app) layout stays in place.
export default function ErrorPage(props: { error: Error & { digest?: string }; retry: () => void }) {
  return <LoadError {...props} />;
}
