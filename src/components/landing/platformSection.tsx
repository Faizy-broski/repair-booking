import {
  Boxes,
  CalendarDays,
  ShoppingCart,
  MessageSquare,
  Users,
  BarChart3,
  TicketCheck,Sparkles
} from "lucide-react";

import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { FadeIn, Stagger, StaggerItem } from "@/components/landing/motion";

const avatarColors = [
  "#5B8CFF",
  "#7C5CFF",
  "#6AD7E5",
  "#86EFAC",
  "#FDA4AF",
];

export default function PlatformSection() {
  return (
    <section className="bg-white py-10 sm:py-14 lg:py-16">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        {/* Header */}
        <FadeIn className="mb-8 grid gap-6 lg:mb-12 lg:grid-cols-2 lg:items-start lg:gap-8">
          <div>
            <Badge
              variant="secondary"
              className="mb-4 rounded-full bg-transparent border border-gray-200 px-4 py-1 text-[10px] font-medium tracking-[0.25em] text-muted-foreground sm:mb-6"
            >
              <span className="mr-2 h-1.5 w-1.5 rounded-full bg-teal-600" />
              THE PLATFORM
            </Badge>

            <h2 className="max-w-2xl text-3xl font-medium leading-tight tracking-[-0.03em] text-slate-950 sm:text-4xl md:text-5xl md:tracking-[-0.04em]">
              One platform to run your{" "}
              <span className="italic text-teal-600">entire</span> repair
              business.
            </h2>
          </div>

          <p className="max-w-md text-sm leading-7 text-muted-foreground lg:ml-auto lg:pt-16 lg:text-right">
            From repair intake to final sale reporting — every operation,
            beautifully connected. No spreadsheets, no second tools, no chaos.
          </p>
        </FadeIn>

        {/* Grid */}
        <Stagger className="grid gap-4 sm:gap-5 lg:grid-cols-12">
          <FeatureCard className="lg:col-span-6">
            <CardHeader icon={Boxes} label="Inventory Management" title="Stock that knows itself." />
            <p className="text-xs text-slate-500">
              Live parts tracking, low-stock alerts and per-branch sync.
            </p>

            <div className="mt-5 rounded-3xl bg-slate-50 p-4 text-xs">
              {[
                ["iPhone 14 screen", "24 pcs", "In stock", "bg-emerald-100 text-emerald-700"],
                ["USB-C charging port", "6 pcs", "Low", "bg-amber-100 text-amber-700"],
                ["PS5 HDMI port", "0 pcs", "Reorder", "bg-rose-100 text-rose-700"],
              ].map(([name, qty, status, color]) => (
                <div
                  key={name}
                  className="flex items-center justify-between border-b border-slate-200 py-2 last:border-0"
                >
                  <span>{name}</span>
                  <div className="flex items-center gap-3">
                    <span className="text-slate-500">{qty}</span>
                    <span className={`rounded-full px-2 py-0.5 text-[10px] font-semibold ${color}`}>
                      {status}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          </FeatureCard>

          <FeatureCard className="lg:col-span-3">
            <CardHeader icon={CalendarDays} label="Appointments" title="Smart scheduling." />
            <p className="text-xs text-slate-500">
              Online bookings synced to your team&apos;s calendar.
            </p>

            <div className="mt-5 grid grid-cols-7 gap-2">
              {Array.from({ length: 21 }).map((_, i) => (
                <div
                  key={i}
                  className={`h-7 w-7 rounded-full ${
                    [3, 8, 9, 14, 17].includes(i)
                      ? "bg-slate-950"
                      : "bg-[#e6f2f2]"
                  }`}
                />
              ))}
            </div>
          </FeatureCard>

          <FeatureCard className="lg:col-span-3">
            <CardHeader icon={ShoppingCart} label="Point of Sale" title="Checkout in seconds." />

            <div className="mt-6 rounded-3xl bg-[linear-gradient(90deg,#020713_0%,#0A3247_100%)] p-6 text-white">
              <p className="text-[10px] font-bold uppercase text-slate-400">Total</p>
              <p className="mt-1 text-3xl font-bold">£148.00</p>

              <div className="mt-5 flex gap-2">
                {["Card", "Cash", "Split"].map((item) => (
                  <span
                    key={item}
                    className="rounded-full bg-white/15 px-3 py-1 text-[10px] font-semibold"
                  >
                    {item}
                  </span>
                ))}
              </div>
            </div>
          </FeatureCard>

          <FeatureCard className="lg:col-span-4">
            <CardHeader icon={MessageSquare} label="SMS & Email" title="Customers in the loop." />

            <div className="mt-6 space-y-3">
              <div className="flex gap-2 items-center ml-auto w-3/4 rounded-full bg-[linear-gradient(90deg,#02071330_0%,#0A32470E_100%)] px-5 py-3 text-xs">
                Your iPhone is ready for pickup <Sparkles className="w-3 h-3 fill-current text-yellow-300"/>
              </div>
              <div className="w-2/3 rounded-full bg-slate-100 px-5 py-3 text-xs">
                Awesome, on my way!
              </div>
            </div>
          </FeatureCard>

          <FeatureCard className="lg:col-span-4">
            <CardHeader icon={Users} label="Employees" title="Team performance." />

            <div className="mt-5 flex -space-x-2">
              {["JS", "AM", "RV", "KL", "PT"].map((name, i) => (
                <div
                  key={name}
                  style={{ backgroundColor: avatarColors[i] }}
                  className="grid h-9 w-9 place-items-center rounded-full border-2 border-white bg-slate-900 text-[10px] font-bold text-white"
                >
                  {name}
                </div>
              ))}
            </div>

            <div className="mt-5 flex items-center justify-between rounded-3xl bg-slate-50 p-4 text-xs">
              <div>
                <p className="text-slate-500">Top tech today</p>
                <p>Repairs closed</p>
              </div>
              <div className="text-right font-bold">
                <p>Amelia M.</p>
                <p>18</p>
              </div>
            </div>
          </FeatureCard>

          <FeatureCard className="lg:col-span-4">
            <CardHeader icon={BarChart3} label="Business Reporting" title="Profit at a glance." />

            <div className="mt-6 flex items-end justify-between gap-2">
              {[36, 62, 48, 72, 55, 88, 70].map((height, i) => (
                <div key={i} className="flex flex-col items-center gap-3">
                  <div
                    className={`w-9 rounded-t-2xl ${
                      i === 5 ? "bg-slate-950" : "bg-[linear-gradient(180deg,#02071380_0%,#0A32470D_100%)]"
                    }`}
                    style={{ height }}
                  />
                  <span className="text-[10px] font-semibold text-slate-600">
                    {["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"][i]}
                  </span>
                </div>
              ))}
            </div>
          </FeatureCard>

          <FeatureCard className="lg:col-span-12">
            <div className="flex flex-col gap-8 lg:flex-row lg:items-center lg:justify-between">
              <div>
                <CardHeader
                  icon={TicketCheck}
                  label="Repair Ticket Management"
                  title="From intake to pickup, never miss a step."
                />
                <p className="mt-2 max-w-2xl text-xs text-slate-500">
                  Custom statuses, parts tracking, photos, signatures, warranties and automated
                  customer updates.
                </p>
              </div>

              <div className="flex flex-wrap gap-2">
                {["Intake", "Diagnose", "Parts", "Repair", "QA", "Pickup"].map((item, i) => (
                  <span
                    key={item}
                    className={`rounded-full px-4 py-2 text-xs font-semibold ${
                      i < 3
                        ? "bg-slate-950 text-white"
                        : "bg-transparent border border-gray-200  text-slate-700"
                    }`}
                  >
                    {item}
                  </span>
                ))}
              </div>
            </div>
          </FeatureCard>
        </Stagger>
      </div>
    </section>
  );
}

function FeatureCard({
  children,
  className = "",
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <StaggerItem className={className}>
      <Card className="h-full rounded-[2rem] border-0 bg-white p-5 shadow-[0_18px_50px_rgba(15,23,42,0.08)] transition-all duration-300 hover:-translate-y-1 hover:shadow-[0_24px_70px_rgba(15,23,42,0.14)] sm:p-6">
        {children}
      </Card>
    </StaggerItem>
  );
}

function CardHeader({
  icon: Icon,
  label,
  title,
}: {
  icon: React.ElementType;
  label: string;
  title: string;
}) {
  return (
    <div>
      <div className="mb-4 flex items-center gap-2 text-[11px] font-bold text-teal-600">
        <Icon className="h-4 w-4" />
        {label}
      </div>

      <h3 className="text-xl font-bold tracking-[-0.03em] text-slate-950">
        {title}
      </h3>
    </div>
  );
}