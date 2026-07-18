import Image from "next/image";
import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { FadeIn } from "@/components/landing/motion";
import { footerLinkGroups } from "@/lib/footer-pages";

export default function Footer() {
  return (
    <footer className="relative overflow-hidden bg-white text-slate-800">
      <div className="absolute left-1/2 top-0 h-[1.5px] w-[90%] -translate-x-1/2 bg-gradient-to-r from-transparent via-brand-teal-light to-transparent" />
      <div className="mx-auto max-w-[1600px] px-4 pt-14 sm:px-6 sm:pt-24 lg:px-24">
        <FadeIn className="grid gap-10 lg:grid-cols-[1fr_2.5fr] lg:gap-12">
          <div>
            <Link href="/" className="inline-flex">
              <Image
                src="/images/logo.svg"
                alt="iRepairly"
                width={230}
                height={70}
                className="h-auto w-[170px] sm:w-[230px]"
              />
            </Link>

            <p className="mt-4 max-w-[380px] text-sm leading-5 text-slate-500 sm:mt-5">
              The operating system for repair businesses that take their craft
              seriously. Designed in Lisbon. Built worldwide.
            </p>
          </div>

          <div className="grid grid-cols-2 gap-8 sm:grid-cols-3 sm:gap-8 lg:grid-cols-5">
            {footerLinkGroups.map((group, groupIndex) => (
              <div key={`${group.title}-${groupIndex}`}>
                <h3 className="mb-5 text-xs font-light uppercase text-slate-500 sm:mb-7">
                  {group.title}
                </h3>

                <ul className="space-y-1">
                  {group.links.map((link) => (
                    <li key={link.label}>
                      <Link
                        href={link.href}
                        className="text-xs text-slate-700 transition-colors hover:text-brand-teal"
                      >
                        {link.label}
                      </Link>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        </FadeIn>

        <div className="mt-14 flex flex-col gap-5 border-t border-slate-200 py-9 text-xs text-slate-500 sm:mt-24 sm:flex-row sm:items-center sm:justify-between">
          <p>© 2026 The Social Nexus Ltd. All rights reserved.</p>

          <p className="flex items-center text-xs gap-3 uppercase ">
            V4.2 <span>·</span> Lisbon
            <ArrowRight className="h-4 w-4" />
            Worldwide
          </p>
        </div>
      </div>
    </footer>
  );
}
