import Link from "next/link";

import { signOut } from "@/app/(auth)/login/actions";
import type { CurrentUser } from "@/lib/session";

const headerLinkClass =
  "shrink-0 font-display text-label font-medium whitespace-nowrap text-accent uppercase hover:opacity-90";

// The header of every page, in one line. Before signing in: only «Личная CRM».
// After: «Группы» next to it, and on the right the user's address and «Выйти». On a narrow screen
// the address is cut with an ellipsis, «Выйти» always stays visible.
export function SiteHeader({ user }: { user?: CurrentUser | null }) {
  return (
    <header className="flex items-baseline justify-between gap-4 md:gap-6">
      <div className="flex shrink-0 items-baseline gap-4 md:gap-6">
        <Link href="/" className={headerLinkClass}>
          Личная CRM
        </Link>
        {user && (
          <Link href="/groups" className={headerLinkClass}>
            Группы
          </Link>
        )}
      </div>
      {user && (
        <div className="flex min-w-0 items-baseline gap-4 md:gap-6">
          <span className="min-w-0 truncate text-meta text-muted-foreground" title={user.email}>
            {user.email}
          </span>
          <form action={signOut} className="shrink-0">
            <button type="submit" className={`${headerLinkClass} cursor-pointer`}>
              Выйти
            </button>
          </form>
        </div>
      )}
    </header>
  );
}
