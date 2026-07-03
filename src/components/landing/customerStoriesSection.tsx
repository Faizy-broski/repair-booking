"use client";

import { useCallback, useEffect, useState } from "react";
import useEmblaCarousel from "embla-carousel-react";
import { Star } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { FadeIn } from "@/components/landing/motion";

const testimonials = [
  {
    name: "Nadia Karim",
    role: "Owner · Northwave Mobile, Toronto",
    initials: "NK",
    quote:
      "We replaced four pieces of software, a whiteboard, and a group text with iRepairly. Our cycle time dropped 38%, and the shop suddenly felt quiet — in the best way.",
  },
  {
    name: "Amir Shah",
    role: "Manager · FixPro Repairs, Lahore",
    initials: "AS",
    quote:
      "Inventory, tickets, staff, and sales finally live in one place. The team stopped chasing updates and started closing jobs faster.",
  },
  {
    name: "Sarah Miller",
    role: "Founder · MobileCare, London",
    initials: "SM",
    quote:
      "The customer updates alone saved us hours every week. Repairs feel organized, clean, and predictable now.",
  },
];

export default function CustomerStoriesCarousel() {
  const [selectedIndex, setSelectedIndex] = useState(0);

  const [emblaRef, emblaApi] = useEmblaCarousel({
    align: "center",
    loop: true,
    dragFree: false,
    containScroll: false,
  });

  const onSelect = useCallback(() => {
    if (!emblaApi) return;
    setSelectedIndex(emblaApi.selectedScrollSnap());
  }, [emblaApi]);

  useEffect(() => {
    if (!emblaApi) return;

    onSelect();
    emblaApi.on("select", onSelect);
    emblaApi.on("reInit", onSelect);

    return () => {
      emblaApi.off("select", onSelect);
      emblaApi.off("reInit", onSelect);
    };
  }, [emblaApi, onSelect]);

  return (
    <section className="overflow-hidden bg-white py-14 sm:py-20 lg:py-24">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <FadeIn className="mb-12 grid gap-6 lg:mb-24 lg:grid-cols-2 lg:items-end lg:gap-10">
          <div>
            <Badge
              variant="secondary"
              className="mb-4 rounded-full bg-transparent border border-gray-200 px-4 py-1 text-[10px] font-medium tracking-[0.25em] text-muted-foreground sm:mb-6"
            >
              <span className="mr-2 h-1.5 w-1.5 rounded-full bg-teal-600" />
              Customer Stories
            </Badge>

            <h2 className="max-w-2xl text-3xl font-medium leading-tight tracking-[-0.03em] text-slate-950 sm:text-4xl md:text-5xl md:tracking-[-0.04em]">
              Loved by repair shops
              <br />
              in <span className="italic text-teal-600">42 countries.</span>
            </h2>
          </div>

          <div className="flex items-center gap-3 lg:justify-end lg:pb-2">
            <div className="flex text-amber-400">
              {Array.from({ length: 5 }).map((_, i) => (
                <Star key={i} className="h-4 w-4 fill-current" />
              ))}
            </div>
            <p className="text-xs text-slate-500">
              4.9 average from 2,800+ reviews
            </p>
          </div>
        </FadeIn>
      </div>

      <div ref={emblaRef} className="overflow-hidden bg-white py-6 sm:py-10">
        <div className="flex items-stretch">
          {testimonials.map((item, index) => {
            const isActive = index === selectedIndex;

            return (
              <div
                key={item.name}
                className="min-w-0 flex-[0_0_92%] px-3 sm:flex-[0_0_86%] sm:px-4 md:flex-[0_0_70%] lg:flex-[0_0_58%]"
              >
                <Card
                  className={`relative flex h-full min-h-[300px] rounded-[2rem] border-0 bg-white p-6 transition-all duration-500 sm:min-h-[350px] sm:p-10 md:p-16 ${
                    isActive
                      ? "scale-100 opacity-100 blur-0 shadow-[0_1px_8px_rgba(15,23,42,0.10)]"
                      : "scale-95 opacity-35 blur-[1.5px] shadow-[0_18px_50px_rgba(15,23,42,0.06)]"
                  }`}
                >
                  {/* <div className="pointer-events-none absolute inset-0 rounded-[2rem] bg-[url('/images/testimonial-pattern.svg')] bg-cover bg-center opacity-30" /> */}

                  <div className="relative flex h-full flex-col justify-between">
                    <h3 className="max-w-2xl text-xl font-medium leading-tight tracking-[-0.03em] text-slate-950 sm:text-3xl md:text-4xl md:tracking-[-0.05em]">
                      “{item.quote.split("iRepairly")[0]}
                      <span className="font-['Segoe_Script'] italic text-teal-600">
                        iRepairly
                      </span>
                      {item.quote.split("iRepairly")[1]}”
                    </h3>

                    <div className="mt-6 flex items-center gap-4 sm:mt-2">
                      <div className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-slate-950 text-[11px] font-bold text-white">
                        {item.initials}
                      </div>

                      <div>
                        <p className="text-xs font-bold text-slate-950">
                          {item.name}
                        </p>
                        <p className="text-[10px] text-slate-500">
                          {item.role}
                        </p>
                      </div>
                    </div>
                  </div>
                </Card>
              </div>
            );
          })}
        </div>
      </div>
    </section>
  );
}
