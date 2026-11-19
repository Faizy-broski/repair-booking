import { BookOpen } from "lucide-react";
import PageShell from "@/components/pages/PageShell";
import PageHero from "@/components/pages/PageHero";
import FaqSection from "@/components/pages/FaqSection";
import CtaSection from "@/components/pages/CtaSection";
import RelatedLinks from "@/components/pages/RelatedLinks";
import { FadeIn } from "@/components/landing/motion";
import type { ServiceArticlePage } from "@/lib/footer-pages";

function slugify(text: string) {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "");
}

const pad = (n: number) => String(n).padStart(2, "0");

export function ArticleContent({
  page,
  includeLead = false,
}: {
  page: ServiceArticlePage;
  includeLead?: boolean;
}) {
  const intro = includeLead ? page.intro : page.intro.slice(1);
  // When embedded in a service page the guide title is already an <h2>, so its sections
  // drop a level to keep a valid heading hierarchy.
  const SectionHeading = includeLead ? "h3" : "h2";
  const SubHeading = includeLead ? "h4" : "h3";
  const [lead, ...restIntro] = intro;

  return (
    <section className="bg-white px-4 pb-16 pt-4 sm:px-6 sm:pb-24 lg:px-8">
      <div className="mx-auto grid max-w-6xl gap-10 lg:grid-cols-[250px_minmax(0,1fr)] lg:gap-16">
        {/* Table of contents */}
        <aside className="hidden lg:block">
          <div className="sticky top-28 rounded-3xl bg-slate-50 p-6">
            <p className="mb-4 text-[11px] font-bold uppercase tracking-[0.22em] text-brand-teal">
              On this page
            </p>
            <nav className="flex flex-col gap-0.5">
              {page.sections.map((section, i) => (
                <a
                  key={section.heading}
                  href={`#${slugify(section.heading)}`}
                  className="group flex items-start gap-3 rounded-xl px-2 py-2 text-[13px] leading-5 text-slate-500 transition-colors hover:bg-white hover:text-slate-950"
                >
                  <span className="mt-px font-semibold tabular-nums text-slate-300 transition-colors group-hover:text-brand-teal">
                    {pad(i + 1)}
                  </span>
                  <span>{section.heading}</span>
                </a>
              ))}
            </nav>
          </div>
        </aside>

        {/* Article body */}
        <div className="min-w-0 max-w-3xl">
          {lead && (
            <div className="border-b border-slate-100 pb-10">
              <p className="text-lg leading-8 text-slate-700 sm:text-xl sm:leading-9">{lead}</p>
              <div className="mt-5 space-y-4">
                {restIntro.map((paragraph, i) => (
                  <p key={i} className="text-base leading-8 text-slate-600">
                    {paragraph}
                  </p>
                ))}
              </div>
            </div>
          )}

          <div className="divide-y divide-slate-100">
            {page.sections.map((section, i) => (
              <FadeIn key={section.heading}>
                <div className="py-10 sm:py-12">
                  <span className="text-xs font-bold tabular-nums tracking-[0.2em] text-brand-teal">
                    {pad(i + 1)}
                  </span>
                  <SectionHeading
                    id={slugify(section.heading)}
                    className="mt-2 scroll-mt-32 text-2xl font-semibold tracking-[-0.025em] text-slate-950 sm:text-[1.75rem] sm:leading-9"
                  >
                    {section.heading}
                  </SectionHeading>

                  {section.body && (
                    <div className="mt-5 space-y-4">
                      {section.body.map((paragraph, j) => (
                        <p key={j} className="text-base leading-8 text-slate-600">
                          {paragraph}
                        </p>
                      ))}
                    </div>
                  )}

                  {section.subsections && (
                    <div className="mt-7 grid gap-4">
                      {section.subsections.map((sub) => (
                        <div
                          key={sub.heading}
                          className="rounded-2xl border border-slate-100 border-l-4 border-l-brand-teal bg-slate-50/70 p-5 sm:p-6"
                        >
                          <SubHeading className="text-base font-semibold text-slate-950">{sub.heading}</SubHeading>
                          <div className="mt-2 space-y-3">
                            {sub.body.map((paragraph, j) => (
                              <p key={j} className="text-[15px] leading-7 text-slate-600">
                                {paragraph}
                              </p>
                            ))}
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </FadeIn>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}

export default function ArticlePageTemplate({ page }: { page: ServiceArticlePage }) {
  const [leadParagraph] = page.intro;

  return (
    <PageShell>
      <PageHero icon={BookOpen} kicker={page.kicker} title={page.title} description={leadParagraph} />

      <ArticleContent page={page} />

      {page.faqs && <FaqSection heading={`${page.cluster} FAQs`} faqs={page.faqs} />}

      <CtaSection heading={`${page.cluster}: start your trial.`} scriptWord="trial." />

      <RelatedLinks heading={`More like ${page.cluster}`} links={page.related} />
    </PageShell>
  );
}
