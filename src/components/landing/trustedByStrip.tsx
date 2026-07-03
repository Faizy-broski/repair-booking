import { FadeIn } from "@/components/landing/motion";

const TRUSTED_LOGOS = ["REPAIRLY", "TEK-PRO", "iFIX-IT", "NEXT-GEN"];

export default function TrustedByStrip() {
  return (
    <section className="relative overflow-hidden bg-white px-4 sm:px-6">
      <FadeIn className="relative mx-auto max-w-5xl py-8 mt-6 bg-white text-center sm:py-10 sm:mt-10">
        {/* top/bottom borders */}

        <div className="absolute left-1/2 top-0 h-px w-[90%] -translate-x-1/2 bg-gradient-to-r from-transparent via-gray-200 to-transparent" />

        {/* center pill */}
        <div className="absolute left-1/2 top-0 z-10 -translate-x-1/2 -translate-y-1/2 bg-white px-2">
          <div className="whitespace-nowrap rounded-full border border-gray-200 bg-white px-3 py-1.5 text-[11px] font-medium text-gray-800 shadow-sm sm:px-6 sm:py-2 sm:text-sm">
            Trusted by investors and financial teams
          </div>
        </div>

        <div className="flex flex-wrap items-center justify-center bg-white gap-x-8 gap-y-4 pt-4 sm:gap-x-20 sm:gap-y-6">
          {TRUSTED_LOGOS.map((logo) => (
            <span
              key={logo}
              className="text-lg font-black font-semibold italic tracking-tight text-gray-600 sm:text-2xl"
            >
              {logo}
            </span>
          ))}
        </div>
        <div className="absolute left-1/2 bottom-0 h-px w-[90%] -translate-x-1/2 bg-gradient-to-r from-transparent via-gray-200 to-transparent" />
      </FadeIn>
    </section>
  );
}
