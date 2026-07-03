"use client";

import { Plus } from "lucide-react";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import { FadeIn } from "@/components/landing/motion";

const faqs = [
  {
    question: "Do we need to migrate from our current system?",
    answer:
      "No heavy migration is required. We help you import your existing customer, repair, inventory, and invoice data so your team can continue working with minimal disruption.",
  },
  {
    question: "Is hardware included?",
    answer:
      "Hardware is optional. You can use your existing devices, or we can recommend compatible printers, barcode scanners, and POS equipment based on your shop setup.",
  },
  {
    question: "What happens to my data if I leave?",
    answer:
      "Your data remains yours. You can export your customers, tickets, invoices, and reports whenever you need.",
  },
  {
    question: "Can the AI co-pilot make mistakes?",
    answer:
      "Yes. AI provides recommendations, but important decisions should always be reviewed by your team before they are finalized.",
  },
];

export default function FAQS() {
  return (
    <section className="bg-white px-4 py-14 sm:px-6 sm:py-20 lg:px-8 lg:py-28">
      <div className="mx-auto grid max-w-7xl gap-10 sm:max-w-2xl lg:max-w-7xl lg:grid-cols-[0.85fr_1.4fr] lg:gap-16">
        {/* Left */}
        <FadeIn className="mx-auto text-center sm:mx-0 sm:text-left lg:mx-0">
          <div className="mb-5 inline-flex items-center gap-3 rounded-full border border-slate-200 bg-white px-5 py-2 text-xs font-medium uppercase tracking-[0.28em] text-slate-500 shadow-sm sm:mb-8">
            <span className="h-2 w-2 rounded-full bg-teal-600" />
            Frequently Asked Questions
          </div>

          <h2 className="mx-auto max-w-[460px] text-3xl leading-tight tracking-[-0.03em] text-[#061b3d] sm:mx-0 sm:text-5xl sm:leading-none sm:tracking-[-0.04em] lg:text-6xl xl:text-7xl">
            Things shops <span className="italic text-teal-700">ask</span> us.
          </h2>
        </FadeIn>

        {/* Right */}
        <FadeIn delay={0.1} className="mx-auto w-full sm:max-w-2xl lg:mx-0 lg:max-w-none">
          <Accordion
            type="single"
            collapsible
            className="w-full border-y border-slate-200"
          >
            {faqs.map((faq, index) => (
              <AccordionItem
                key={index}
                value={`item-${index}`}
                className="border-slate-200"
              >
                <AccordionTrigger className="group py-5 hover:no-underline [&>svg]:hidden sm:py-8">
                  <div className="flex w-full items-center justify-between gap-4 text-left sm:gap-6">
                    <span className="text-base font-medium text-slate-900 transition-colors group-hover:text-teal-700 sm:text-xl">
                      {faq.question}
                    </span>

                    <Plus className="h-5 w-5 shrink-0 text-slate-500 transition-transform duration-300 group-data-[state=open]:rotate-45 sm:h-6 sm:w-6" />
                  </div>
                </AccordionTrigger>

                <AccordionContent className="pb-5 pr-6 text-sm leading-6 text-slate-600 sm:pb-8 sm:pr-14 sm:text-base sm:leading-7">
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
