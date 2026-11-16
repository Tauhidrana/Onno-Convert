import Link from "next/link";

export default function NotFound() {
  return (
    <main className="mx-auto w-full max-w-xl px-4 py-24 text-center">
      <p className="text-sm font-semibold uppercase tracking-wide text-brand">404</p>
      <h1 className="mt-2 text-3xl font-semibold tracking-tight">That tool does not exist.</h1>
      <p className="mt-3 text-black/55 dark:text-white/55">The link may be old, or the tool has not been built yet.</p>
      <Link
        href="/"
        className="mt-6 inline-flex rounded-xl bg-ink px-4 py-2.5 text-sm font-medium text-white dark:bg-white dark:text-black"
      >
        Browse all tools
      </Link>
    </main>
  );
}
