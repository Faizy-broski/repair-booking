"use client";

import Link from "next/link";
import { AlertTriangle, RotateCcw } from "lucide-react";
import { useEffect } from "react";
import PageShell from "@/components/pages/PageShell";

export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <PageShell>
      <section className="flex min-h-[70vh] flex-col items-center justify-center px-4 py-20 text-center sm:px-6">
        <span className="flex h-16 w-16 items-center justify-center rounded-full bg-red-100 text-red-600 sm:h-20 sm:w-20">
          <AlertTriangle className="h-8 w-8 sm:h-9 sm:w-9" strokeWidth={1.8} />
        </span>

        <p className="mt-8 text-sm font-semibold uppercase tracking-[0.28em] text-red-500">
          Something broke
        </p>

        <h1 className="mt-4 max-w-2xl text-4xl font-light leading-[0.95] tracking-[-0.03em] text-slate-950 sm:text-6xl">
          Something went wrong.
        </h1>

        <p className="mt-6 max-w-md text-sm leading-6 text-slate-500 sm:text-base">
          An unexpected error occurred while loading this page. Try again, or
          head back to the homepage.
        </p>

        <div className="mt-10 flex flex-col items-stretch gap-4 sm:flex-row sm:items-center">
          <button
            onClick={reset}
            className="inline-flex items-center justify-center gap-2 rounded-full bg-[linear-gradient(90deg,_#008080_0%,_#008080_37%,_#18E3CD_100%)] px-7 py-4 text-sm font-semibold text-white shadow-sm transition-transform hover:scale-[1.02]"
          >
            <RotateCcw className="h-4 w-4" />
            Try again
          </button>

          <Link
            href="/"
            className="inline-flex items-center justify-center gap-2 rounded-full border border-slate-200 bg-white px-7 py-4 text-sm font-semibold text-slate-700 transition-colors hover:bg-slate-50"
          >
            Back to home
          </Link>
        </div>
      </section>
    </PageShell>
  );
}
