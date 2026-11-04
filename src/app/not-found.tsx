import Link from "next/link";

import { SiteHeader } from "@/components/site-header";
import { Button } from "@/components/ui/button";
import { getCurrentUser } from "@/lib/session";

// An address that is no page of the app. It sits outside the route groups, so it draws its own
// header: the full one after signing in, only «Личная CRM» before.
export default async function NotFound() {
  const user = await getCurrentUser();

  return (
    <>
      <SiteHeader user={user} />
      <main className="flex-1">
        <div className="flex flex-col items-center gap-5 py-12 text-center md:gap-6">
          <h1 className="font-display text-title font-bold text-balance uppercase">Такой страницы нет</h1>
          <p className="max-w-xl text-pretty text-muted-foreground">Возможно, контакт удалён или в адресе опечатка.</p>
          <Button asChild>
            <Link href="/">К списку контактов</Link>
          </Button>
        </div>
      </main>
    </>
  );
}
