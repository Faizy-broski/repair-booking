import Image from "next/image";
import Link from "next/link";
import {
  ArrowRight,
  BarChart3,
  Building2,
  Cuboid,
  ShoppingCart,
  Users,
  Wrench,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { FadeIn, Stagger, StaggerItem } from "@/components/landing/motion";

const features = [
  {
    icon: Wrench,
    title: "Repair Management",
    desc: "Track every repair job from intake to pickup. Custom statuses, parts tracking, and automated customer notifications.",
  },
  {
    icon: ShoppingCart,
    title: "Point of Sale",
    desc: "Fast, intuitive POS with barcode scanning, split payments, gift cards, and real-time inventory deductions.",
  },
  {
    icon: Cuboid,
    title: "Inventory Control",
    desc: "Multi-location stock management with low-stock alerts, stock adjustments, and purchase order tracking.",
  },
  {
    icon: Users,
    title: "Customer CRM",
    desc: "Full customer history, repair logs, purchase records, and built-in communication tools.",
  },
  {
    icon: BarChart3,
    title: "Reports & Analytics",
    desc: "Sales, profit & loss, branch revenue, staff performance, and repair turnaround dashboards.",
  },
  {
    icon: Building2,
    title: "Multi-Branch",
    desc: "Manage all locations from one account with per-branch reporting, inventory syncing, and staff controls.",
  },
];

export default function CoreFeaturesSection() {
  return (
    <section className="bg-white py-14 sm:py-20 lg:py-24">
      <div className="mx-auto grid max-w-7xl gap-10 px-4 sm:px-6 lg:grid-cols-2 lg:items-start lg:gap-16 lg:px-8">
        {/* Left */}
        <FadeIn className="lg:sticky lg:top-24">
          <Badge
              variant="secondary"
              className="mb-4 rounded-full bg-transparent border border-gray-200 px-4 py-1 text-[10px] font-medium tracking-[0.25em] text-muted-foreground sm:mb-6"
            >
            <span className="mr-2 h-1.5 w-1.5 rounded-full bg-teal-600" />
            Core Features
          </Badge>

          <h2 className="max-w-md text-3xl font-medium leading-tight tracking-[-0.03em] text-slate-950 sm:text-4xl md:text-5xl md:tracking-[-0.04em]">
            Everything your{" "}
            <span className="italic text-teal-600">shop</span>
            <br />
            needs
          </h2>

          <p className="mt-4 max-w-md text-sm leading-7 text-slate-500 sm:mt-6">
            From the first repair booking to the final sales report — iRepairly
            handles every part of your daily operation.
          </p>

          <Button asChild className="mt-6 rounded-full bg-[linear-gradient(90deg,_#008080_0%,_#008080_37%,_#18E3CD_100%)] px-6 py-6 text-sm font-bold text-white hover:bg-teal-700 sm:mt-8">
            <Link href="#pricing">
              See pricing
              <ArrowRight className="ml-2 h-4 w-4" />
            </Link>
          </Button>

          <div className="relative mt-12 hidden max-w-lg lg:mt-20 lg:block">
            <Image
              src="/images/dashboardpreview.svg"
              alt="iRepairly dashboard preview"
              width={680}
              height={420}
              className="w-full object-contain"
              priority
            />
          </div>
        </FadeIn>

        {/* Right */}
        <Stagger className="space-y-5 sm:space-y-8">
          {features.map((feature, index) => (
            <StaggerItem key={feature.title}>
              <Card className="rounded-[2rem] border-0 bg-white p-5 shadow-[0_18px_55px_rgba(15,23,42,0.08)] transition-all duration-300 hover:-translate-y-1 hover:shadow-[0_24px_70px_rgba(15,23,42,0.12)] sm:p-7">
                <div className="flex gap-4 sm:gap-5">
                  <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-slate-950 text-white sm:h-11 sm:w-11">
                    <feature.icon className="h-5 w-5" strokeWidth={1.8} />
                  </div>

                  <div>
                    <div className="mb-2 flex items-center gap-2">
                      <span className="text-xs font-bold text-slate-500">
                        {String(index + 1).padStart(2, "0")}
                      </span>
                      <h3 className="text-base font-bold tracking-[-0.03em] text-slate-950 sm:text-lg">
                        {feature.title}
                      </h3>
                    </div>

                    <p className="max-w-xl text-sm leading-7 text-slate-600">
                      {feature.desc}
                    </p>
                  </div>
                </div>
              </Card>
            </StaggerItem>
          ))}
        </Stagger>
      </div>
    </section>
  );
}