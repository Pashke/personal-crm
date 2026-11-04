import type { Metadata } from "next";
import Link from "next/link";

import { Button } from "@/components/ui/button";

export const metadata: Metadata = { title: "Ссылка устарела" };

// Better Auth sends here every sign-in link that does not work: expired, already used, cancelled
// by a newer one or damaged. The reason is not told apart: the answer is the same.
export default function ExpiredLinkPage() {
  return (
    <div className="flex flex-col items-center gap-5 py-12 text-center md:gap-6">
      <h1 className="font-display text-title font-bold text-balance uppercase">Ссылка устарела, запроси новую</h1>
      <Button asChild>
        <Link href="/login">На страницу входа</Link>
      </Button>
    </div>
  );
}
