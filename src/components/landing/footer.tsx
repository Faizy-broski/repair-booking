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
        <FadeIn className="grid gap-10 lg:grid-cols-[1fr_3fr] xl:grid-cols-[1fr_4fr] lg:gap-16">
          <div className="max-w-xs">
            <Link href="/" className="inline-flex">
              <Image
                src="/images/logo.svg"
                alt="iRepairly"
                width={230}
                height={70}
                className="h-auto w-[170px] sm:w-[230px]"
              />
            </Link>

            <p className="mt-5 text-sm leading-6 text-slate-500 sm:mt-7">
              The operating system for repair businesses that take their craft
              seriously.
            </p>
          </div>

          <div className="grid grid-cols-2 gap-8 sm:grid-cols-3 md:grid-cols-5 md:gap-8 lg:gap-10">
            {footerLinkGroups.map((group, groupIndex) => (
              <div key={`${group.title}-${groupIndex}`}>
                <h3 className="mb-5 text-xs font-semibold uppercase tracking-wider text-slate-900 sm:mb-7">
                  {group.title}
                </h3>

                <ul className="space-y-3">
                  {group.links.map((link) => (
                    <li key={link.label}>
                      <Link
                        href={link.href}
                        className="text-sm text-slate-600 transition-colors hover:text-brand-teal"
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

        <div className="mt-14 flex flex-col items-center justify-between gap-5 border-t border-slate-200 py-9 text-xs text-slate-500 sm:mt-24 sm:flex-row">
          <p>
            © {new Date().getFullYear()}{" "}
            <a
              href="https://thesocialnexus.co.uk/"
              target="_blank"
              rel="noopener noreferrer"
              className="hover:text-slate-800 transition-colors"
            >
            <strong>The Social Nexus Ltd.</strong>
            </a>{" "}
            All rights reserved.
          </p>
       
        </div>
      </div>

      <div className="pointer-events-none mx-auto max-w-[1600px] select-none px-4 sm:px-6 lg:px-24">
        <Image
          src="/images/irepairly.svg"
          alt="iRepairly"
          width={2400}
          height={520}
          priority
          className="w-full object-contain"
        />
      </div>
    </footer>
  );
}
