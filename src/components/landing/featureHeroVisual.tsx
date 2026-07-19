import Image from 'next/image'
import { FadeIn } from '@/components/landing/motion'

export default function FeatureHeroVisual() {
  return (
    <FadeIn
      delay={0.15}
      className="relative mx-auto h-[280px] w-full max-w-7xl overflow-hidden bg-white sm:h-[420px] md:h-[560px] lg:h-[700px]"
    >
      {/* radial lines svg */}
      <Image
        src="/images/radiallines.svg"
        alt=""
        fill
        priority
        className="pointer-events-none select-none object-cover"
      />

      {/* main dashboard */}
      <div className="absolute left-1/2 top-[24px] z-10 w-[92%] max-w-[890px] -translate-x-1/2 sm:top-[50px] lg:top-[95px] lg:w-[72%]">
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
      <Image
        src="/images/smscard.svg"
        alt=""
        width={235}
        height={76}
        className="absolute left-[6%] top-[60px] z-20 hidden w-[150px] md:block lg:left-[13%] lg:top-[70px] lg:w-[235px]"
      />

      {/* revenue KPI */}
      <Image
        src="/images/revenuecard.svg"
        alt=""
        width={260}
        height={180}
        className="absolute right-[6%] top-[0px] z-20 hidden w-[170px] md:block lg:right-[10%] lg:w-[260px]"
      />

      {/* queue card */}
      <Image
        src="/images/queuecard.svg"
        alt=""
        width={260}
        height={230}
        className="absolute bottom-[25px] left-[4%] z-20 hidden w-[170px] md:block lg:bottom-[35px] lg:left-[8%] lg:w-[260px]"
      />

      {/* pixel battery chip */}
      <Image
        src="/images/batterychip.svg"
        alt=""
        width={250}
        height={90}
        className="absolute bottom-[35px] right-[4%] z-20 hidden w-[160px] md:block lg:bottom-[50px] lg:right-[8%] lg:w-[250px]"
      />
    </FadeIn>
  )
}
