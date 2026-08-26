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

export default function ArticlePageTemplate({ page }: { page: ServiceArticlePage }) {
  const [leadParagraph, ...restIntro] = page.intro;

  return (
    <PageShell>
      <PageHero icon={BookOpen} kicker={page.kicker} title={page.title} description={leadParagraph} />

      <section className="bg-white px-4 pb-14 sm:px-6 sm:pb-20 lg:px-8">
        <div className="mx-auto grid max-w-6xl gap-8 lg:grid-cols-[240px_1fr] lg:gap-14">
          {/* Table of contents */}
          <aside className="hidden lg:block">
            <div className="sticky top-32">
              <p className="mb-4 text-xs font-bold uppercase tracking-[0.22em] text-slate-400">
                On this page
              </p>
              <nav className="flex flex-col gap-1 border-l border-slate-200">
                {page.sections.map((section) => (
                  <a
                    key={section.heading}
                    href={`#${slugify(section.heading)}`}
                    className="border-l-2 border-transparent py-1.5 pl-4 text-sm leading-5 text-slate-500 transition-colors hover:border-brand-teal hover:text-brand-teal"
                  >
                    {section.heading}
                  </a>
                ))}
              </nav>
            </div>
          </aside>

          {/* Article body */}
          <div className="min-w-0 rounded-[2rem] border border-slate-100 bg-white p-6 shadow-[0_18px_55px_rgba(15,23,42,0.06)] sm:p-10 lg:p-12">
            <div className="space-y-5 border-b border-slate-100 pb-10">
              {restIntro.map((paragraph, i) => (
                <p key={i} className="text-base leading-8 text-slate-600">
                  {paragraph}
                </p>
              ))}
            </div>

            <div className="space-y-12 pt-10 sm:space-y-16">
              {page.sections.map((section) => (
                <FadeIn key={section.heading}>
                  <h2
                    id={slugify(section.heading)}
                    className="scroll-mt-32 text-xl font-bold tracking-[-0.02em] text-slate-950 sm:text-2xl"
                  >
                    {section.heading}
                  </h2>

                  {section.body && (
                    <div className="mt-4 space-y-4">
                      {section.body.map((paragraph, i) => (
                        <p key={i} className="text-sm leading-7 text-slate-600 sm:text-base sm:leading-8">
                          {paragraph}
                        </p>
                      ))}
                    </div>
                  )}

                  {section.subsections && (
                    <div className="mt-6 space-y-6 sm:mt-8">
                      {section.subsections.map((sub) => (
                        <div
                          key={sub.heading}
                          className="rounded-2xl bg-slate-50/70 p-5 sm:p-6"
                        >
                          <h3 className="text-base font-bold text-slate-950">{sub.heading}</h3>
                          <div className="mt-2 space-y-3">
                            {sub.body.map((paragraph, i) => (
                              <p key={i} className="text-sm leading-7 text-slate-600">
                                {paragraph}
                              </p>
                            ))}
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </FadeIn>
              ))}
            </div>
          </div>
        </div>
      </section>

      {page.faqs && <FaqSection faqs={page.faqs} />}

      <CtaSection />

      <RelatedLinks links={page.related} />
    </PageShell>
  );
}
