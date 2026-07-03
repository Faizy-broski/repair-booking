"use client";

import Image from "next/image"
import {
  Wrench,
  ShoppingCart,
  Package,
  Users,
  CalendarDays,
  BarChart3,
  FileText,
  Gift,
  DollarSign,
  MessageSquare,
  Star,
  Clock,
  UserCog,
  Building2,
  Bell,
  Phone,
  SlidersHorizontal,
  Shield,
  CreditCard,
  Zap,
} from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { FadeIn, Stagger, StaggerItem } from "@/components/landing/motion";

const modules = [
  { label: "Repair Booking", icon: Wrench },
  { label: "Point of Sale", icon: ShoppingCart },
  { label: "Inventory Management", icon: Package },
  { label: "Customer CRM", icon: Users },
  { label: "Appointments", icon: CalendarDays },
  { label: "Reports & Analytics", icon: BarChart3 },
  { label: "Invoicing", icon: FileText },
  { label: "Gift Cards & Store Credit", icon: Gift },
  { label: "Expense Tracking", icon: DollarSign },
  { label: "Internal Messaging", icon: MessageSquare },
  { label: "Google Reviews", icon: Star },
  { label: "Employee Time Clock", icon: Clock },
  { label: "Staff & Roles", icon: UserCog },
  { label: "Multi-Branch Management", icon: Building2 },
  { label: "Smart Notifications", icon: Bell },
  { label: "WebRTC Branch Calls", icon: Phone },
  { label: "Custom Fields", icon: SlidersHorizontal },
  { label: "Role-Based Access", icon: Shield },
  { label: "Payment Processing", icon: CreditCard },
  { label: "API Integrations", icon: Zap },
];

export default function ModulesSection() {
  return (
    <section className="relative overflow-hidden py-16 text-white bg-[url('/images/moduleHero.svg')] bg-cover">
      {/* SVG background lines */}
      {/* <div className="pointer-events-none absolute inset-0"> */}
        {/* <svg
          className="h-full w-full"
          viewBox="0 0 1440 760"
          fill="none"
          preserveAspectRatio="none"
        >
          <rect width="1440" height="760" fill="url(#bg)" />

          <path
            d="M-100 160C260 520 1170 520 1540 160"
            stroke="white"
            strokeOpacity="0.16"
          />
          <path
            d="M-100 250C260 500 1170 500 1540 250"
            stroke="white"
            strokeOpacity="0.09"
          />
          <path
            d="M-100 340C260 480 1170 480 1540 340"
            stroke="white"
            strokeOpacity="0.06"
          />
          <path
            d="M-100 640C280 370 1160 370 1540 640"
            stroke="white"
            strokeOpacity="0.06"
          />

          <defs>
            <radialGradient
              id="bg"
              cx="0"
              cy="0"
              r="1"
              gradientUnits="userSpaceOnUse"
              gradientTransform="translate(250 80) rotate(35) scale(720 480)"
            >
              <stop stopColor="#083C3F" />
              <stop offset="0.55" stopColor="#041622" />
              <stop offset="1" stopColor="#020713" />
            </radialGradient>
          </defs>
        </svg> */}
        {/* <img src="/images/moduleHero.svg" alt="bg" className="bg-cover"/>
      </div> */}

      <div className="relative mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        {/* Header */}
        <FadeIn className="mx-auto max-w-2xl text-center">
          <Badge className="mb-6 rounded-full border-0 bg-white/25 px-4 py-1.5 text-[10px] font-medium uppercase tracking-[0.28em] text-white hover:bg-white/25 sm:mb-8">
            <span className="mr-2 h-1.5 w-1.5 rounded-full bg-white" />
            Modules
          </Badge>

          <h2 className="text-3xl font-medium leading-tight tracking-[-0.03em] sm:text-4xl md:text-5xl md:tracking-[-0.04em]">
            20+ Powerful modules.
            <br />
            One simple{" "}
            <span className="italic font-normal">subscription.</span>
          </h2>

          <p className="mt-6 text-sm text-white/60 sm:mt-8">
            No add-ons. No hidden fees. Everything included from day one.
          </p>
        </FadeIn>

        {/* Modules grid */}
        <Stagger
          stagger={0.03}
          className="mx-auto mt-12 grid max-w-6xl grid-cols-1 gap-3 sm:mt-16 sm:grid-cols-2 lg:mt-24 lg:grid-cols-5"
        >
          {modules.map(({ label, icon: Icon }) => (
            <StaggerItem key={label}>
              <div className="flex h-12 items-center gap-3 rounded-xl border border-white/10 bg-white/25 px-4 text-sm text-white shadow-[inset_0_1px_0_rgba(255,255,255,0.16),0_12px_28px_rgba(0,0,0,0.22)] backdrop-blur-md transition hover:-translate-y-0.5 hover:bg-white/30">
                <Icon className="h-4 w-4 shrink-0 text-white/90" strokeWidth={1.7} />
                <span className="truncate">{label}</span>
              </div>
            </StaggerItem>
          ))}
        </Stagger>
      </div>
    </section>
  );
}