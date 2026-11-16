import Link from "next/link";
import { Logo } from "@/components/brand";
import { ThemeToggle } from "@/components/theme-toggle";

export function SiteHeader() {
  return (
    <header className="sticky top-0 z-40 border-b border-black/5 bg-paper/85 backdrop-blur dark:border-white/10 dark:bg-[#0d0d10]/85">
      <div className="mx-auto flex h-16 w-full max-w-6xl items-center justify-between px-4 sm:px-6">
        <Link href="/" className="flex items-center gap-3">
          <Logo />
          <span className="leading-tight">
            <span className="block text-[15px] font-semibold tracking-tight">Onno Convert</span>
            <span className="block text-[11px] text-black/50 dark:text-white/50">by OnnoPoth</span>
          </span>
        </Link>
        <nav className="flex items-center gap-1">
          <Link
            href="/#tools"
            className="rounded-lg px-3 py-2 text-sm text-black/60 transition hover:bg-black/5 hover:text-black dark:text-white/60 dark:hover:bg-white/10 dark:hover:text-white"
          >
            All tools
          </Link>
          <ThemeToggle />
        </nav>
      </div>
    </header>
  );
}
