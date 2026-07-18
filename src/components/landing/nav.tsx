"use client";
import React from "react";
import { useState, useEffect } from "react";
import Image from "next/image";
import Link from "next/link";
import {
  ChevronRight,
  Check,
  Menu,
  X,
  Phone,
  DollarSign,
  UserCheck,
  ShoppingCart,
  Quote,
  Sparkles,
} from "lucide-react";

const NAV_LINKS = [
  { label: "Features", href: "/features" },
  { label: "Modules", href: "/#modules" },
  { label: "Industries", href: "/industries" },
  { label: "Pricing", href: "/#pricing" },
  { label: "Reviews", href: "/#testimonials" },
];

export default function Nav() {
  const [mobileNavOpen, setMobileNavOpen] = useState(false);
  return (
    <>
      <header className="fixed left-0 top-0 z-50 w-full px-3 py-3 sm:px-4 sm:py-5">
        <nav className="mx-auto flex h-[64px] max-w-7xl items-center justify-between rounded-full border border-brand-teal-light bg-white/90 py-0 pl-4 pr-3 shadow-[0_18px_40px_rgba(15,118,110,0.14)] backdrop-blur-xl sm:h-[76px] sm:pl-8 sm:pr-5">
          <Link href="/" className="flex items-center gap-2 flex-shrink-0">
            <img
              src="/images/logo.svg"
              alt="iRepairly"
              className="h-6 w-auto sm:h-8"
            />
          </Link>

          <div className="hidden md:flex items-center gap-8 text-sm font-medium text-slate-700">
            {NAV_LINKS.map(({ label, href }) => (
              <Link key={label} href={href} className="hover:text-primary transition-colors">
                {label}
              </Link>
            ))}
          </div>

          <div className="flex items-center gap-2 my-2 sm:gap-5">
            <Link
              href="/login"
              className="hidden md:inline-flex items-center text-[15px] font-bold text-slate-800 hover:text-primary transition-colors"
            >
              Login
            </Link>

            <Link
              href="/register"
              className="group inline-flex items-center gap-2 rounded-full bg-[linear-gradient(90deg,_#008080_0%,_#008080_37%,_#18E3CD_100%)] px-4 py-2.5 text-xs font-bold text-white shadow-sm transition-all duration-300 hover:scale-[1.04] hover:shadow-[0_10px_30px_rgba(0,128,128,0.35)] sm:px-6 sm:py-3 sm:text-sm"
            >
              <Sparkles className="h-4 w-4 transition-transform duration-300 group-hover:rotate-12" />
              <span className="hidden sm:inline">Start Free Trial</span>
              <span className="sm:hidden">Trial</span>
            </Link>

            <button
              className="md:hidden rounded-full p-2 text-slate-700 hover:bg-slate-100"
              aria-label="Open menu"
              onClick={() => setMobileNavOpen(true)}
            >
              <Menu className="h-5 w-5" />
            </button>
          </div>
        </nav>
      </header>
      {mobileNavOpen && (
        <div className="fixed inset-0 z-[100] flex md:hidden">
          <div
            className="absolute inset-0 bg-black/50"
            onClick={() => setMobileNavOpen(false)}
          />

          <div className="relative flex h-full w-72 flex-col bg-brand-teal animate-slide-in-left shadow-2xl">
            <div className="flex items-center justify-between border-b border-white/10 px-5 py-4">
              <Image
                src="/images/tsn_logo.png"
                alt="The Social Nexus"
                width={140}
                height={36}
                className="h-9 w-auto"
              />
              <button
                onClick={() => setMobileNavOpen(false)}
                className="rounded-lg p-1.5 text-white/60 hover:bg-white/10 hover:text-white transition-colors"
                aria-label="Close menu"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <nav className="flex flex-col gap-1 px-4 py-5">
              {NAV_LINKS.map(({ label, href }) => (
                <Link
                  key={href}
                  href={href}
                  className="rounded-lg px-4 py-3 text-base font-medium text-white/80 hover:bg-white/10 hover:text-white transition-colors"
                  onClick={() => setMobileNavOpen(false)}
                >
                  {label}
                </Link>
              ))}
            </nav>

            <div className="mt-auto border-t border-white/10 px-4 py-5 flex flex-col gap-3">
              <Link
                href="/login"
                className="inline-flex items-center justify-center rounded-xl border border-white/40 px-4 py-2.5 text-sm font-semibold text-white transition-all duration-300 hover:scale-[1.02] hover:bg-white/10"
                onClick={() => setMobileNavOpen(false)}
              >
                Sign in
              </Link>
              <Link
                href="/register"
                className="group inline-flex items-center justify-center gap-1.5 rounded-xl bg-white px-4 py-2.5 text-sm font-semibold text-brand-teal shadow-sm transition-all duration-300 hover:scale-[1.02] hover:shadow-md"
                onClick={() => setMobileNavOpen(false)}
              >
                Get started free <ChevronRight className="h-3.5 w-3.5 transition-transform duration-300 group-hover:translate-x-1" />
              </Link>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
