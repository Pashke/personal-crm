import Link from "next/link";

import { Button } from "@/components/ui/button";

// A contact that is not there: someone else's, deleted, or a made-up number. All look the same,
// so nothing tells whether such a contact exists. The page «Изменить» of the contact shows it too.
export default function ContactNotFound() {
  return (
    <div className="flex flex-col items-center gap-5 py-12 text-center md:gap-6">
      <h1 className="font-display text-title font-bold text-balance uppercase">Контакт не найден</h1>
      <p className="max-w-xl text-pretty text-muted-foreground">Возможно, контакт удалён или в адресе опечатка.</p>
      <Button asChild>
        <Link href="/">К списку контактов</Link>
      </Button>
    </div>
  );
}
