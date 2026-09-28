import { FadeIn } from "@/components/landing/motion";
import { LeadForm } from "@/components/marketing/lead-form";
import { Badge } from "@/components/ui/badge";
import { MessageSquare, CheckCircle2 } from "lucide-react";

export default function HomeContactSection() {
  return (
    <section className="relative overflow-hidden bg-gradient-to-b from-white to-slate-50/50 px-4 py-20 sm:px-6 lg:px-8">
      {/* Decorative background blurs */}
      <div className="absolute -left-40 top-0 h-[400px] w-[400px] rounded-full bg-teal-100/40 blur-[100px] pointer-events-none" />
      <div className="absolute right-0 bottom-0 h-[300px] w-[300px] rounded-full bg-cyan-100/40 blur-[100px] pointer-events-none" />

      <div className="mx-auto grid max-w-7xl gap-12 lg:grid-cols-2 lg:items-center relative z-10">
        <FadeIn className="space-y-8">
          <div>
            <Badge className="mb-4 rounded-full border-0 bg-teal-100/50 text-teal-800 px-4 py-1.5 text-xs font-semibold uppercase tracking-widest">
              Get in Touch
            </Badge>
            <h2 className="text-4xl font-bold tracking-tight text-slate-950 sm:text-5xl lg:leading-[1.1]">
              Ready to streamline <br className="hidden sm:block" />
              <span className="text-transparent bg-clip-text bg-gradient-to-r from-teal-600 to-cyan-500">
                your shop?
              </span>
            </h2>
            <p className="mt-6 text-lg text-slate-600 max-w-lg leading-relaxed">
              Book a quick 20-minute demo with our team or send us a message to see how iRepairly can work for your specific setup.
            </p>
          </div>

          <ul className="space-y-4">
            {[
              "Personalized 1-on-1 platform walkthrough",
              "Discuss your shop's unique workflows",
              "Pricing & custom migration plans",
            ].map((item, i) => (
              <li key={i} className="flex items-center gap-3 text-slate-700">
                <CheckCircle2 className="h-5 w-5 text-teal-500 shrink-0" />
                <span className="text-md font-medium">{item}</span>
              </li>
            ))}
          </ul>
        </FadeIn>

        <FadeIn delay={0.1} className="relative">
          {/* A slight glowing border effect behind the card */}
          <div className="absolute -inset-0.5 rounded-[32px] bg-gradient-to-br from-teal-200 to-cyan-200 opacity-50 blur-lg pointer-events-none" />
          
          <div className="relative rounded-[28px] border border-white bg-white/80 backdrop-blur-xl p-8 shadow-2xl sm:p-10">
            <div className="mb-8 flex items-center gap-4 border-b border-slate-100 pb-6">
              <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-teal-50 text-teal-600">
                <MessageSquare className="h-6 w-6" />
              </div>
              <div>
                <h3 className="text-xl font-bold text-slate-950">Book a Demo</h3>
                <p className="text-sm text-slate-500">We usually respond within 1 business day.</p>
              </div>
            </div>
            <LeadForm source="demo_request" submitLabel="Submit Request" className="mt-2" />
          </div>
        </FadeIn>
      </div>
    </section>
  );
}
