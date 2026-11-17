import Link from "next/link";
import { LayoutGrid } from "lucide-react";
import { Logo } from "@/components/brand";
import { ThemeToggle } from "@/components/theme-toggle";
import { CommandPalette } from "@/components/command-palette";

export function SiteHeader() {
  return (
    <header className="sticky top-0 z-40 border-b border-black/5 bg-paper/85 backdrop-blur dark:border-white/10 dark:bg-[#0d0d10]/85">
      <div className="mx-auto flex h-16 w-full max-w-6xl items-center justify-between px-4 sm:px-6">
        <Link href="/" className="flex items-center" aria-label="Onno Convert by OnnoPoth">
          <Logo />
        </Link>
        <nav className="flex items-center gap-1.5">
          <Link
            href="/#tools"
            aria-label="All tools"
            className="flex min-h-11 items-center gap-1 rounded-lg px-2 text-sm text-muted transition hover:bg-surface-2 hover:text-ink"
          >
            <LayoutGrid className="h-5 w-5 sm:hidden" aria-hidden="true" />
            <span className="hidden sm:inline">All tools</span>
          </Link>
          <CommandPalette />
          <ThemeToggle />
        </nav>
      </div>
    </header>
  );
}
