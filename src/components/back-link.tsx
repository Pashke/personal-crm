import Link from "next/link";

export function BackLink({ href, children }: { href: string; children: React.ReactNode }) {
  return (
    <Link
      href={href}
      className="inline-flex items-center gap-2 self-start font-display text-label font-medium text-accent uppercase wrap-anywhere underline-offset-4 hover:underline"
    >
      <span aria-hidden className="shrink-0">
        ←
      </span>
      {children}
    </Link>
  );
}
