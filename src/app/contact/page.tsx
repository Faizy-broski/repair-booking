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

      <section className="relative overflow-hidden bg-gradient-to-b from-white to-slate-50/50 px-4 pb-24 sm:px-6 lg:px-8">
        {/* Decorative background blurs */}
        <div className="absolute -right-40 top-20 h-[400px] w-[400px] rounded-full bg-teal-100/40 blur-[100px] pointer-events-none" />
        <div className="absolute left-0 bottom-0 h-[300px] w-[300px] rounded-full bg-cyan-100/40 blur-[100px] pointer-events-none" />

        <div className="mx-auto grid max-w-5xl gap-12 lg:grid-cols-[1fr_1.1fr] lg:items-start relative z-10">
          <FadeIn className="space-y-10 lg:pt-8">
            {SECTIONS.map((section) => (
              <div key={section.heading} className="relative pl-6 before:absolute before:left-0 before:top-2.5 before:h-2 before:w-2 before:rounded-full before:bg-teal-500">
                <h2 className="text-xl font-bold tracking-[-0.02em] text-slate-950 sm:text-2xl">
                  {section.heading}
                </h2>
                <p className="mt-3 text-sm leading-7 text-slate-600 sm:text-base">{section.body}</p>
              </div>
            ))}
          </FadeIn>

          <FadeIn delay={0.1} className="relative">
            {/* A slight glowing border effect behind the card */}
            <div className="absolute -inset-0.5 rounded-[32px] bg-gradient-to-br from-teal-200 to-cyan-200 opacity-50 blur-lg pointer-events-none" />
            
            <div className="relative rounded-[28px] border border-white bg-white/80 backdrop-blur-xl p-8 shadow-2xl sm:p-10">
              <div className="mb-8 flex items-center gap-4 border-b border-slate-100 pb-6">
                <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-teal-50 text-teal-600">
                  <Mail className="h-6 w-6" />
                </div>
                <div>
                  <h3 className="text-xl font-bold text-slate-950">Send us a message</h3>
                  <p className="text-sm text-slate-500">We aim to reply within 24 hours.</p>
                </div>
              </div>
              <LeadForm source="contact_us" submitLabel="Send Message" className="mt-2" />
            </div>
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
