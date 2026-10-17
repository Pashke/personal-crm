import Link from "next/link";

import { Button } from "@/components/ui/button";

export default function NotFound() {
  return (
    <div className="flex flex-col items-center gap-5 py-12 text-center md:gap-6">
      <h1 className="font-display text-title font-bold text-balance uppercase">Такой страницы нет</h1>
      <p className="max-w-xl text-pretty text-muted-foreground">Возможно, контакт удалён или в адресе опечатка.</p>
      <Button asChild>
        <Link href="/">К списку контактов</Link>
      </Button>
    </div>
  );
}
