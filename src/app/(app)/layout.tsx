import { SiteHeader } from "@/components/site-header";
import { requireUser } from "@/lib/session";

// The pages after signing in. Each page checks the user itself too (requireUser): a layout alone
// does not protect the pages under it.
export default async function AppLayout({ children }: LayoutProps<"/">) {
  const user = await requireUser();

  return (
    <>
      <SiteHeader user={user} />
      <main className="flex-1">{children}</main>
    </>
  );
}
