import Link from "next/link";
import { ArrowRight, SearchX } from "lucide-react";
import PageShell from "@/components/pages/PageShell";

export default function NotFound() {
  return (
    <PageShell>
      <section className="flex min-h-[70vh] flex-col items-center justify-center px-4 py-20 text-center sm:px-6">
        <span className="flex h-16 w-16 items-center justify-center rounded-full bg-brand-teal-light text-brand-teal sm:h-20 sm:w-20">
          <SearchX className="h-8 w-8 sm:h-9 sm:w-9" strokeWidth={1.8} />
        </span>

        <p className="mt-8 text-sm font-semibold uppercase tracking-[0.28em] text-brand-teal">
          404 error
        </p>

        <h1 className="mt-4 max-w-2xl text-4xl font-light leading-[0.95] tracking-[-0.03em] text-slate-950 sm:text-6xl">
          This page went missing.
        </h1>

        <p className="mt-6 max-w-md text-sm leading-6 text-slate-500 sm:text-base">
          The page you're looking for doesn't exist or may have moved. Let's
          get you back on track.
        </p>

        <div className="mt-10 flex flex-col items-stretch gap-4 sm:flex-row sm:items-center">
          <Link
            href="/"
            className="inline-flex items-center justify-center gap-2 rounded-full bg-[linear-gradient(90deg,_#008080_0%,_#008080_37%,_#18E3CD_100%)] px-7 py-4 text-sm font-semibold text-white shadow-sm transition-transform hover:scale-[1.02]"
          >
            Back to home
            <ArrowRight className="h-4 w-4" />
          </Link>

          <Link
            href="/services"
            className="inline-flex items-center justify-center gap-2 rounded-full border border-slate-200 bg-white px-7 py-4 text-sm font-semibold text-slate-700 transition-colors hover:bg-slate-50"
          >
            Explore services
          </Link>
        </div>
      </section>
    </PageShell>
  );
}
