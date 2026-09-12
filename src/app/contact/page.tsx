import type { Metadata } from "next";
import { Mail } from "lucide-react";
import PageShell from "@/components/pages/PageShell";
import PageHero from "@/components/pages/PageHero";
import RelatedLinks from "@/components/pages/RelatedLinks";
import { FadeIn } from "@/components/landing/motion";
import { LeadForm } from "@/components/marketing/lead-form";

export const metadata: Metadata = {
  title: "Contact Us | iRepairly",
  description: "Contact the iRepairly team for sales, support, press, or partnership enquiries.",
  keywords: ["contact iRepairly", "repair software support", "sales enquiries"],
  alternates: { canonical: "/contact" },
};

const SECTIONS = [
  {
    heading: "Sales enquiries",
    body: "Interested in iRepairly for your shop? Start a free trial from the homepage, book a 20-minute demo, or send us a message and a member of our team will get back to you.",
  },
  {
    heading: "Existing customers",
    body: "Already using iRepairly? Visit our Help Centre or Support pages for the fastest way to get an answer, or reach your account contact directly.",
  },
  {
    heading: "Press & partnerships",
    body: "For press enquiries or partnership discussions, send us a message below and our team will route it appropriately.",
  },
];

export default function ContactPage() {
  return (
    <PageShell>
      <PageHero
        icon={Mail}
        kicker="Get In Touch"
        title="We're happy to answer questions, big or small."
        description="Whether you're evaluating iRepairly for your shop, need help with an existing account, or want to talk press or partnerships, here's how to reach us."
      />

      <section className="bg-white px-4 pb-20 sm:px-6 lg:px-8">
        <div className="mx-auto grid max-w-4xl gap-10 lg:grid-cols-[1fr_1.1fr] lg:items-start">
          <FadeIn className="space-y-10">
            {SECTIONS.map((section) => (
              <div key={section.heading}>
                <h2 className="text-xl font-bold tracking-[-0.02em] text-slate-950 sm:text-2xl">
                  {section.heading}
                </h2>
                <p className="mt-3 text-sm leading-7 text-slate-600 sm:text-base">{section.body}</p>
              </div>
            ))}
          </FadeIn>

          <FadeIn delay={0.05} className="rounded-3xl border border-slate-100 bg-white p-6 shadow-[0_18px_50px_rgba(15,23,42,0.08)] sm:p-8">
            <h3 className="mb-5 text-lg font-bold text-slate-950">Send us a message</h3>
            <LeadForm source="contact_us" submitLabel="Send Message" />
          </FadeIn>
        </div>
      </section>

      <RelatedLinks
        links={[
          { label: "Support", href: "/resources/support" },
          { label: "Help Centre", href: "/resources/help-centre" },
          { label: "About", href: "/company/about" },
        ]}
      />
    </PageShell>
  );
}
