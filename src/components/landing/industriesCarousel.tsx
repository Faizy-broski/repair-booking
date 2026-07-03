"use client";

import { useEffect, useState } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

const slides = [
  [
    {
      title: "Mobile phone repair",
      desc: "Built for the volume and velocity of phone repair shops.",
      badge: "+38% throughput",
      image: "/images/mobilerepair.svg",
      className: "lg:col-span-7",
    },
    {
      title: "Gaming console repair",
      desc: "Diagnose, document and deliver — without the chaos.",
      badge: "4.8★ customer satisfaction",
      image: "/images/consolerepair.svg",
      className: "lg:col-span-5",
    },
    {
      title: "Laptop repair",
      desc: "Component-level tracking and warranty workflows.",
      badge: "30 min avg intake + repair",
      image: "/images/laptoprepair.svg",
      className: "lg:col-span-5",
    },
    {
      title: "Electronics retail",
      desc: "Unified POS, inventory and customer profiles.",
      badge: "12k SKUs supported",
      image: "/images/electronicsretail.svg",
      className: "lg:col-span-7",
    },
  ],
  // [
  //   {
  //     title: "Bicycle repair",
  //     desc: "Track tune-ups, parts, labor and service history with ease.",
  //     badge: "2x faster check-ins",
  //     image: "/images/industries/bicycle-repair.jpg",
  //     className: "lg:col-span-7",
  //   },
  //   {
  //     title: "Jewellery repair",
  //     desc: "Secure intake, photos, estimates and customer approvals.",
  //     badge: "Secure item tracking",
  //     image: "/images/industries/jewellery-repair.jpg",
  //     className: "lg:col-span-5",
  //   },
  //   {
  //     title: "Watch repair",
  //     desc: "Manage delicate repairs, serials, warranties and diagnostics.",
  //     badge: "Precision workflows",
  //     image: "/images/industries/watch-repair.jpg",
  //     className: "lg:col-span-5",
  //   },
  //   {
  //     title: "Appliance repair",
  //     desc: "Handle large jobs, field service notes and parts inventory.",
  //     badge: "Field-ready jobs",
  //     image: "/images/industries/appliance-repair.jpg",
  //     className: "lg:col-span-7",
  //   },
  // ],
  // [
  //   {
  //     title: "Camera repair",
  //     desc: "Organize lens, sensor and body repair pipelines.",
  //     badge: "Visual repair logs",
  //     image: "/images/industries/camera-repair.jpg",
  //     className: "lg:col-span-7",
  //   },
  //   {
  //     title: "Drone repair",
  //     desc: "Track batteries, propellers, diagnostics and test flights.",
  //     badge: "Smart repair stages",
  //     image: "/images/industries/drone-repair.jpg",
  //     className: "lg:col-span-5",
  //   },
  //   {
  //     title: "Musical instrument repair",
  //     desc: "Manage restoration, tuning, parts and customer updates.",
  //     badge: "Custom job flows",
  //     image: "/images/industries/instrument-repair.jpg",
  //     className: "lg:col-span-5",
  //   },
  //   {
  //     title: "Small engine repair",
  //     desc: "Perfect for mower, generator and power tool service shops.",
  //     badge: "Parts + labor synced",
  //     image: "/images/industries/small-engine-repair.jpg",
  //     className: "lg:col-span-7",
  //   },
  // ],
];

export default function IndustriesCarousel() {
  const [active, setActive] = useState(0);

  const nextSlide = () => {
    setActive((prev) => (prev + 1) % slides.length);
  };

  const prevSlide = () => {
    setActive((prev) => (prev - 1 + slides.length) % slides.length);
  };

  useEffect(() => {
    const timer = setInterval(nextSlide, 3000);
    return () => clearInterval(timer);
  }, []);

  return (
    <section className="bg-white px-6 py-24 lg:px-8">
      <div className="mx-auto max-w-7xl">
        <div className="mb-14 grid items-start gap-8 lg:grid-cols-2">
          <div>
            <div className="mb-5 inline-flex items-center gap-2 rounded-full border border-slate-200 bg-white px-4 py-1.5 text-[10px] font-semibold uppercase tracking-[0.28em] text-slate-500 shadow-sm">
              <span className="h-1.5 w-1.5 rounded-full bg-teal-500" />
              Industries we serve
            </div>

            <h2 className="max-w-xl text-4xl font-medium tracking-[-0.04em] text-slate-950 sm:text-5xl lg:text-6xl">
              Trusted by the{" "}
              <span className="italic text-teal-600">repair</span> retail
              elite.
            </h2>
          </div>

          <p className="max-w-md justify-self-start pt-10 text-sm leading-7 text-slate-500 lg:justify-self-end lg:text-right">
            From single-counter phone shops to multi-branch electronics chains —
            iRepairly adapts to how you actually run your business.
          </p>
        </div>

        <div className="relative overflow-hidden">
          <div
            className="flex transition-transform duration-700 ease-out"
            style={{ transform: `translateX(-${active * 100}%)` }}
          >
            {slides.map((items, index) => (
              <div key={index} className="min-w-full">
                <div className="grid grid-cols-1 gap-5 lg:grid-cols-12">
                  {items.map((item) => (
                    <IndustryCard key={item.title} {...item} />
                  ))}
                </div>
              </div>
            ))}
          </div>
        </div>

        <div className="mt-12 flex items-center justify-center gap-3">
          {/* <Button
            variant="ghost"
            size="icon"
            onClick={prevSlide}
            className="h-9 w-9 rounded-full border border-slate-200 bg-white text-slate-500 hover:bg-slate-50"
          >
            <ChevronLeft className="h-4 w-4" />
          </Button> */}

          <div className="flex items-center gap-2">
            {slides.map((_, index) => (
              <button
                key={index}
                onClick={() => setActive(index)}
                className={cn(
                  "h-1.5 rounded-full transition-all duration-300",
                  active === index
                    ? "h-2 w-16 bg-teal-600"
                    : "w-2 h-2 bg-teal-200 hover:bg-teal-400"
                )}
                aria-label={`Go to slide ${index + 1}`}
              />
            ))}
          </div>

          {/* <Button
            variant="ghost"
            size="icon"
            onClick={nextSlide}
            className="h-9 w-9 rounded-full border border-slate-200 bg-white text-slate-500 hover:bg-slate-50"
          >
            <ChevronRight className="h-4 w-4" />
          </Button> */}
        </div>
      </div>
    </section>
  );
}

function IndustryCard({
  title,
  desc,
  badge,
  image,
  className,
}: {
  title: string;
  desc: string;
  badge: string;
  image: string;
  className: string;
}) {
  return (
    <article
      className={cn(
        "group relative h-[230px] lg:h-[300px] overflow-hidden rounded-2xl bg-slate-900 shadow-sm",
        className
      )}
    >
      <img
        src={image}
        alt={title}
        className="h-full w-full object-cover transition duration-700 group-hover:scale-105"
      />

      {/* <div className="absolute inset-0 bg-gradient-to-t from-slate-950/90 via-slate-950/35 to-slate-950/5" /> */}

      <div className="absolute left-5 top-5 rounded-full bg-white/90 px-3 py-1 text-[10px] font-medium text-slate-700 shadow-sm backdrop-blur">
        {badge}
      </div>

      <div className="absolute bottom-6 left-6 right-6">
        <h3 className="text-2xl font-medium tracking-[-0.03em] text-white">
          {title}
        </h3>
        <p className="mt-2 max-w-md text-xs leading-5 text-white/75">
          {desc}
        </p>
      </div>
    </article>
  );
}