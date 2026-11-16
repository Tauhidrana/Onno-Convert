import { ToolExplorer } from "@/components/tool-explorer";

export default function HomePage() {
  return (
    <main>
      <section className="relative overflow-hidden">
        <div className="pointer-events-none absolute inset-0 -z-10 bg-[radial-gradient(70%_60%_at_50%_-10%,#ece8ff_0%,transparent_70%)] dark:bg-[radial-gradient(70%_60%_at_50%_-10%,#221c4d_0%,transparent_70%)]" />
        <div className="mx-auto w-full max-w-6xl px-4 pb-10 pt-14 text-center sm:px-6 sm:pt-20">
          <p className="mx-auto mb-4 w-fit rounded-full border border-brand/20 bg-brand-soft px-3 py-1 text-xs font-medium text-brand dark:border-brand/30 dark:bg-brand/15 dark:text-violet-300">
            Private by design · nothing is uploaded
          </p>
          <h1 className="text-balance text-4xl font-semibold tracking-tight sm:text-5xl">
            Convert anything. <span className="text-brand">Privately.</span>
          </h1>
          <p className="mx-auto mt-4 max-w-xl text-pretty text-[15px] leading-relaxed text-black/60 dark:text-white/60">
            PDF, images, spreadsheets, audio, video and ebooks — converted in your browser by OnnoPoth.
            Your files never leave this device.
          </p>
        </div>
      </section>
      <ToolExplorer />
    </main>
  );
}
