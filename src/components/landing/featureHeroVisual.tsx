"use client";

import Image from 'next/image'
import { motion } from 'framer-motion'
import { FadeIn } from '@/components/landing/motion'

function FloatingCard({
  src,
  alt,
  width,
  height,
  className,
  delay = 0,
  duration = 3.4,
}: {
  src: string
  alt: string
  width: number
  height: number
  className: string
  delay?: number
  duration?: number
}) {
  return (
    <motion.div
      className={className}
      animate={{ y: [0, -10, 0] }}
      transition={{ duration, repeat: Infinity, ease: 'easeInOut', delay }}
    >
      <Image src={src} alt={alt} width={width} height={height} className="h-auto w-full drop-shadow-xl" />
    </motion.div>
  )
}

export default function FeatureHeroVisual() {
  return (
    <FadeIn
      delay={0.15}
      className="relative mx-auto h-[260px] w-full max-w-7xl overflow-hidden bg-white sm:h-[360px] md:h-[460px] lg:h-[600px]"
    >
      {/* radial lines svg — kept behind and contained so it fans out tightly
          from the dashboard instead of stretching full-bleed across the section */}
      <div className="absolute inset-0 -z-10 mx-auto max-w-[1000px]">
        <Image
          src="/images/radiallines.svg"
          alt=""
          fill
          priority
          className="pointer-events-none select-none object-contain"
        />
      </div>

      {/* main dashboard */}
      <div className="absolute left-1/2 top-[16px] z-10 w-[94%] max-w-[950px] -translate-x-1/2 sm:top-[30px] lg:top-[55px] lg:w-[78%]">
        <Image
          src="/images/dashboard.svg"
          alt="Repair shop dashboard"
          width={1000}
          height={520}
          priority
          className="h-auto w-full"
        />
      </div>

      {/* sms card */}
      <FloatingCard
        src="/images/smscard.svg"
        alt=""
        width={235}
        height={76}
        delay={0}
        className="absolute left-[4%] top-[45px] z-20 hidden w-[150px] md:block lg:left-[15%] lg:top-[38px] lg:w-[225px]"
      />

      {/* revenue KPI */}
      <FloatingCard
        src="/images/revenuecard.svg"
        alt=""
        width={260}
        height={180}
        delay={0.4}
        className="absolute right-[4%] -top-[6px] z-20 hidden w-[170px] md:block lg:right-[12%] lg:top-[-10px] lg:w-[245px]"
      />

      {/* queue card */}
      <FloatingCard
        src="/images/queuecard.svg"
        alt=""
        width={260}
        height={230}
        delay={0.8}
        className="absolute bottom-[10px] left-[2%] z-20 hidden w-[170px] md:block lg:bottom-[10px] lg:left-[10%] lg:w-[245px]"
      />

      {/* pixel battery chip */}
      <FloatingCard
        src="/images/batterychip.svg"
        alt=""
        width={250}
        height={90}
        delay={1.2}
        className="absolute bottom-[18px] right-[2%] z-20 hidden w-[160px] md:block lg:bottom-[18px] lg:right-[10%] lg:w-[235px]"
      />
    </FadeIn>
  )
}
