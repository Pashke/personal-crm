import { ArrowLeftIcon } from "lucide-react";
import Link from "next/link";

export function BackLink({ href, children }: { href: string; children: React.ReactNode }) {
  return (
    <Link
      href={href}
      className="inline-flex items-center gap-1 text-sm text-muted-foreground wrap-anywhere hover:text-foreground"
    >
      <ArrowLeftIcon className="size-4 shrink-0" />
      {children}
    </Link>
  );
}
