import { Plus } from "lucide-react";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import { FadeIn } from "@/components/landing/motion";
import type { FaqItem } from "@/lib/footer-pages";

export default function FaqSection({
  heading = "Frequently asked questions",
  faqs,
}: {
  heading?: string;
  faqs: FaqItem[];
}) {
  if (!faqs.length) return null;

  return (
    <section className="bg-white px-4 py-14 sm:px-6 sm:py-20 lg:px-8">
      <div className="mx-auto max-w-3xl">
        <FadeIn className="mb-8 text-center sm:mb-12">
          <h2 className="text-2xl font-medium tracking-[-0.02em] text-slate-950 sm:text-4xl">
            {heading}
          </h2>
        </FadeIn>

        <FadeIn delay={0.1}>
          <Accordion type="single" collapsible className="w-full border-y border-slate-200">
            {faqs.map((faq, index) => (
              <AccordionItem key={index} value={`item-${index}`} className="border-slate-200">
                <AccordionTrigger className="group py-5 hover:no-underline [&>svg]:hidden sm:py-7">
                  <div className="flex w-full items-center justify-between gap-4 text-left sm:gap-6">
                    <span className="text-base font-medium text-slate-900 transition-colors group-hover:text-teal-700">
                      {faq.question}
                    </span>
                    <Plus className="h-5 w-5 shrink-0 text-slate-500 transition-transform duration-300 group-data-[state=open]:rotate-45" />
                  </div>
                </AccordionTrigger>
                <AccordionContent className="pb-5 pr-6 text-sm leading-6 text-slate-600 sm:pb-7 sm:pr-14">
                  {faq.answer}
                </AccordionContent>
              </AccordionItem>
            ))}
          </Accordion>
        </FadeIn>
      </div>
    </section>
  );
}
