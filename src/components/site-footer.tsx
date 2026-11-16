export function SiteFooter() {
  return (
    <footer className="mt-20 border-t border-black/5 py-10 dark:border-white/10">
      <div className="mx-auto flex w-full max-w-6xl flex-col items-center justify-between gap-3 px-4 text-sm text-black/55 sm:flex-row sm:px-6 dark:text-white/55">
        <p>
          <span className="font-medium text-black/75 dark:text-white/80">Private. Browser-only. Built by OnnoPoth.</span>
        </p>
        <p>Files never leave your device. No uploads, no accounts, no tracking.</p>
      </div>
    </footer>
  );
}
