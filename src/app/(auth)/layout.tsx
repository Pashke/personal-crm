import { SiteHeader } from "@/components/site-header";

// The sign-in pages: open without signing in, only «Личная CRM» in the header.
export default function AuthLayout({ children }: LayoutProps<"/">) {
  return (
    <>
      <SiteHeader />
      <main className="flex flex-1 flex-col">{children}</main>
    </>
  );
}
