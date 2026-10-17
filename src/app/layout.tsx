import type { Metadata } from "next";
import { Caveat, Oswald, PT_Serif } from "next/font/google";
import Link from "next/link";

import { Toaster } from "@/components/ui/sonner";

import "./globals.css";

// The landing's fonts: Oswald for titles and labels, PT Serif for text, Caveat for handwritten notes.
const oswald = Oswald({ variable: "--font-oswald", subsets: ["latin", "cyrillic"] });
const ptSerif = PT_Serif({
  variable: "--font-pt-serif",
  subsets: ["latin", "cyrillic"],
  weight: ["400", "700"],
});
const caveat = Caveat({ variable: "--font-caveat", subsets: ["latin", "cyrillic"], preload: false });

export const metadata: Metadata = {
  title: {
    default: "Личная CRM",
    template: "%s — Личная CRM",
  },
  description: "Контакты людей, которых я знаю лично",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="ru" className={`${oswald.variable} ${ptSerif.variable} ${caveat.variable} h-full`}>
      <body className="flex min-h-full flex-col p-3.5 md:p-frame">
        {/* The landing's signature double "label" frame: a thick outer line and a thin inner one */}
        <div className="mx-auto flex w-full max-w-5xl flex-1 rounded-md border-2 border-accent p-1.25 md:rounded-lg md:p-1.5">
          <div className="flex min-w-0 flex-1 flex-col gap-7 rounded-xs border border-accent px-4.5 pt-4.5 pb-6 md:gap-10 md:rounded-sm md:px-frame-x md:py-frame-y">
            <header>
              <Link
                href="/"
                className="font-display text-label font-medium text-accent uppercase hover:opacity-90"
              >
                Личная CRM
              </Link>
            </header>
            <main className="flex-1">{children}</main>
          </div>
        </div>
        <Toaster position="top-center" theme="light" />
      </body>
    </html>
  );
}
