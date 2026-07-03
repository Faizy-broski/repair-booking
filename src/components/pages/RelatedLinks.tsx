import Link from "next/link";
import { ArrowUpRight } from "lucide-react";
import { FadeIn } from "@/components/landing/motion";
import type { RelatedLink } from "@/lib/footer-pages";

export default function RelatedLinks({
  heading = "Related",
  links,
}: {
  heading?: string;
  links: RelatedLink[];
}) {
  if (!links.length) return null;

  return (
    <section className="bg-slate-50/60 px-4 py-14 sm:px-6 sm:py-16 lg:px-8">
      <div className="mx-auto max-w-5xl">
        <FadeIn>
          <h2 className="mb-6 text-sm font-medium uppercase tracking-[0.25em] text-slate-500">
            {heading}
          </h2>
          <div className="flex flex-wrap gap-3">
            {links.map((link) => (
              <Link
                key={link.href}
                href={link.href}
                className="inline-flex items-center gap-1.5 rounded-full border border-slate-200 bg-white px-5 py-2.5 text-sm font-medium text-slate-800 transition-colors hover:border-brand-teal-light hover:text-brand-teal"
              >
                {link.label}
                <ArrowUpRight className="h-3.5 w-3.5" />
              </Link>
            ))}
          </div>
        </FadeIn>
      </div>
    </section>
  );
}
