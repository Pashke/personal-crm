import Link from "next/link";

import { Button } from "@/components/ui/button";

export default function NotFound() {
  return (
    <div className="space-y-4 py-12 text-center">
      <h1 className="font-heading text-2xl font-semibold">Такой страницы нет</h1>
      <p className="text-muted-foreground">Возможно, контакт удалён или в адресе опечатка.</p>
      <Button asChild>
        <Link href="/">К списку контактов</Link>
      </Button>
    </div>
  );
}
