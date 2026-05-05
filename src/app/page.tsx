'use client'
import { useState, useEffect } from 'react'
import Image from 'next/image'
import Link from 'next/link'
import {
  Wrench, Package, Users, BarChart3, CreditCard, Calendar,
  Bell, FileText, MessageSquare, Star, Gift, Settings2,
  Building2, Clock, Shield, Zap, ChevronRight, Check, Menu, X,
  Phone, DollarSign, UserCheck, ShoppingCart, Quote
} from 'lucide-react'

const TESTIMONIALS = [
  {
    quote: "Finally a POS that truly understands the repair workflow. The multi-branch management alone saved us 15+ hours of admin weekly.",
    author: "Theodore",
    role: "CEO, Skyline Global",
    image: "https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?q=80&w=200&h=200&auto=format&fit=crop"
  },
  {
    quote: "The inventory tracking and automated customer alerts have transformed our shop. Our customer satisfaction has never been higher.",
    author: "Sarah Jenkins",
    role: "Owner, TechFix Solutions",
    image: "https://images.unsplash.com/photo-1494790108377-be9c29b29330?q=80&w=200&h=200&auto=format&fit=crop"
  },
  {
    quote: "Scaling to 8 branches was seamless with this platform. The real-time dashboard gives me full visibility from anywhere.",
    author: "Michael Chen",
    role: "Director, MobileHub",
    image: "https://images.unsplash.com/photo-1500648767791-00dcc994a43e?q=80&w=200&h=200&auto=format&fit=crop"
  }
]

const SOCIAL_PROOF_AVATARS = [
  "https://images.unsplash.com/photo-1599566150163-29194dcaad36?q=80&w=100&h=100&auto=format&fit=crop",
  "https://images.unsplash.com/photo-1535713875002-d1d0cf377fde?q=80&w=100&h=100&auto=format&fit=crop",
  "https://images.unsplash.com/photo-1580489944761-15a19d654956?q=80&w=100&h=100&auto=format&fit=crop",
  "https://images.unsplash.com/photo-1438761681033-6461ffad8d80?q=80&w=100&h=100&auto=format&fit=crop",
  "https://images.unsplash.com/photo-1472099645785-5658abf4ff4e?q=80&w=100&h=100&auto=format&fit=crop"
]

// ─── Feature Cards (Screenshot 2 style) ───────────────────────────────────

const FEATURE_CARDS = [
  {
    icon: Wrench,
    title: 'Repair Management',
    desc: 'Track every repair job from intake to pickup. Custom statuses, parts tracking, and automated customer notifications.',
    iconColor: 'text-primary',
    iconBg: 'bg-primary-container',
    borderColor: 'border-primary/20',
    shadowColor: 'shadow-primary/10',
    hoverBorderColor: 'group-hover:border-primary/50',
    hoverShadowColor: 'group-hover:shadow-primary/20',
  },
  {
    icon: CreditCard,
    title: 'Point of Sale',
    desc: 'Fast, intuitive POS with barcode scanning, split payments, gift cards, and real-time inventory deductions.',
    iconColor: 'text-brand-yellow-dark',
    iconBg: 'bg-brand-yellow-light',
    borderColor: 'border-brand-yellow/30',
    shadowColor: 'shadow-brand-yellow/10',
    hoverBorderColor: 'group-hover:border-brand-yellow/60',
    hoverShadowColor: 'group-hover:shadow-brand-yellow/20',
  },
  {
    icon: Package,
    title: 'Inventory Control',
    desc: 'Multi-location stock management with low-stock alerts, stock adjustments, and purchase order tracking.',
    iconColor: 'text-secondary',
    iconBg: 'bg-secondary-container',
    borderColor: 'border-secondary/20',
    shadowColor: 'shadow-secondary/10',
    hoverBorderColor: 'group-hover:border-secondary/50',
    hoverShadowColor: 'group-hover:shadow-secondary/20',
  },
  {
    icon: Users,
    title: 'Customer CRM',
    desc: 'Full customer history, repair logs, purchase records, and built-in communication tools.',
    iconColor: 'text-tertiary',
    iconBg: 'bg-tertiary-container',
    borderColor: 'border-tertiary/20',
    shadowColor: 'shadow-tertiary/10',
    hoverBorderColor: 'group-hover:border-tertiary/50',
    hoverShadowColor: 'group-hover:shadow-tertiary/20',
  },
  {
    icon: BarChart3,
    title: 'Reports & Analytics',
    desc: 'Sales, profit & loss, branch revenue, staff performance, and repair turnaround — all in one dashboard.',
    iconColor: 'text-primary',
    iconBg: 'bg-primary-container',
    borderColor: 'border-primary/20',
    shadowColor: 'shadow-primary/10',
    hoverBorderColor: 'group-hover:border-primary/50',
    hoverShadowColor: 'group-hover:shadow-primary/20',
  },
  {
    icon: Building2,
    title: 'Multi-Branch',
    desc: 'Manage all your locations from one account. Per-branch reporting, staff, inventory, and inter-branch calling.',
    iconColor: 'text-error',
    iconBg: 'bg-error-container',
    borderColor: 'border-error/20',
    shadowColor: 'shadow-error/10',
    hoverBorderColor: 'group-hover:border-error/50',
    hoverShadowColor: 'group-hover:shadow-error/20',
  },
]

const ALL_MODULES = [
  { icon: Wrench, label: 'Repair Booking' },
  { icon: ShoppingCart, label: 'Point of Sale' },
  { icon: Package, label: 'Inventory Management' },
  { icon: Users, label: 'Customer CRM' },
  { icon: Calendar, label: 'Appointments' },
  { icon: BarChart3, label: 'Reports & Analytics' },
  { icon: FileText, label: 'Invoicing' },
  { icon: Gift, label: 'Gift Cards & Store Credit' },
  { icon: DollarSign, label: 'Expense Tracking' },
  { icon: MessageSquare, label: 'Internal Messaging' },
  { icon: Star, label: 'Google Reviews' },
  { icon: Clock, label: 'Employee Time Clock' },
  { icon: UserCheck, label: 'Staff & Roles' },
  { icon: Building2, label: 'Multi-Branch Management' },
  { icon: Bell, label: 'Smart Notifications' },
  { icon: Phone, label: 'WebRTC Branch Calls' },
  { icon: Settings2, label: 'Custom Fields' },
  { icon: Shield, label: 'Role-Based Access' },
  { icon: CreditCard, label: 'Payment Processing' },
  { icon: Zap, label: 'API Integrations' },
]

const STEPS = [
  {
    step: '01',
    title: 'Create your account',
    desc: 'Sign up in minutes. Your dedicated subdomain, branding, and first branch are ready instantly.',
  },
  {
    step: '02',
    title: 'Set up your shop',
    desc: 'Import products, configure repair types, add staff with roles, and customise fields to match your workflow.',
  },
  {
    step: '03',
    title: 'Start serving customers',
    desc: 'Book repairs, ring up sales, print invoices, and watch live dashboards update in real time.',
  },
]

interface PricingPlan {
  id: string
  name: string
  price_monthly: number
  price_yearly: number
  max_branches: number
  max_users: number
  features: string[]
  plan_type: 'free' | 'paid' | 'enterprise'
  stripe_price_id_monthly: string | null
}

const FEATURE_LABELS: Record<string, string> = {
  pos: 'Point of Sale', inventory: 'Inventory management', repairs: 'Repair ticketing',
  reports: 'Reports & analytics', messaging: 'Customer messaging',
  appointments: 'Appointment booking', expenses: 'Expense tracking',
  employees: 'Employee management', gift_cards: 'Gift cards',
  google_reviews: 'Google review requests', phone: 'VoIP phone',
  custom_fields: 'Custom fields',
}
function fmtFeature(k: string) {
  return FEATURE_LABELS[k] ?? k.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase())
}
function planDesc(p: PricingPlan): string {
  if (p.plan_type === 'enterprise') return 'For chains and franchises that need full control and SLA guarantees.'
  const branches = p.max_branches >= 50 ? 'unlimited branches' : `${p.max_branches} branch${p.max_branches > 1 ? 'es' : ''}`
  const users = p.max_users >= 999 ? 'unlimited staff' : `up to ${p.max_users} staff`
  return `For businesses needing ${branches} and ${users}.`
}
function planCta(p: PricingPlan): string {
  if (p.plan_type === 'enterprise') return 'Contact sales'
  if (p.plan_type === 'free') return 'Start 30 Days free trial'
  return 'Start 30 Days free trial'
}
function planCtaHref(p: PricingPlan): string {
  return p.plan_type === 'enterprise' ? 'mailto:connect@repairbooking.co.uk' : '/register'
}
function isHighlighted(plans: PricingPlan[], idx: number): boolean {
  return plans.length >= 2 && idx === Math.floor(plans.length / 2)
}



import { FeatureTabs } from '@/components/shared/feature-tabs'

// ─── Page ─────────────────────────────────────────────────────────────────
export default function HomePage() {
  const [activeTestimonial, setActiveTestimonial] = useState(0)
  const [mobileNavOpen, setMobileNavOpen] = useState(false)
  const [plans, setPlans] = useState<PricingPlan[]>([])
  const [plansLoading, setPlansLoading] = useState(true)
  const [billing, setBilling] = useState<'monthly' | 'yearly'>('monthly')

  useEffect(() => {
    const timer = setInterval(() => {
      setActiveTestimonial((v) => (v + 1) % TESTIMONIALS.length)
    }, 5000)
    return () => clearInterval(timer)
  }, [])

  useEffect(() => {
    fetch('/api/plans')
      .then(r => r.json())
      .then(j => setPlans(j.data ?? []))
      .catch(() => { })
      .finally(() => setPlansLoading(false))
  }, [])

  const t = TESTIMONIALS[activeTestimonial]
  return (
    <>
      {/* ── Navbar ─────────────────────────────────────────────────────── */}
      <header className="sticky top-0 z-50 bg-brand-teal border-b border-brand-teal-dark/25">
        <nav className="mx-auto max-w-7xl px-6 lg:px-8 flex h-18 items-center justify-between">
          <Link href="/" className="flex items-center gap-2 flex-shrink-0">
            <Image
              src="/images/tsn_logo.png"
              alt="The Social Nexus — RepairBooking"
              width={200}
              height={52}
              className="h-12 w-auto"
              priority
            />
          </Link>

          <div className="hidden md:flex items-center gap-8 text-base font-medium text-white/80">
            <Link href="#features" className="hover:text-white transition-colors">Features</Link>
            <Link href="#modules" className="hover:text-white transition-colors">Modules</Link>
            <Link href="#pricing" className="hover:text-white transition-colors">Pricing</Link>
            <Link href="#testimonials" className="hover:text-white transition-colors">Reviews</Link>
          </div>

          <div className="flex items-center gap-3">
            <Link
              href="/login"
              className="hidden md:inline-flex items-center rounded-lg border border-white/40 px-4 py-2 text-sm font-semibold text-white hover:bg-white/10 transition-colors"
            >
              Sign in
            </Link>
            <Link
              href="/register"
              className="inline-flex items-center gap-1.5 rounded-lg bg-white px-4 py-2 text-sm font-semibold text-brand-teal transition-colors shadow-sm"
            >
              Get started free
              <ChevronRight className="h-3.5 w-3.5" />
            </Link>
            <button
              className="md:hidden p-2 rounded-md text-white/80 hover:text-white"
              aria-label="Open menu"
              onClick={() => setMobileNavOpen(true)}
            >
              <Menu className="h-5 w-5" />
            </button>
          </div>
        </nav>
      </header>

      {/* Mobile nav — full-height left slide-in overlay */}
      {mobileNavOpen && (
        <div className="fixed inset-0 z-[100] flex md:hidden">
          {/* Backdrop */}
          <div
            className="absolute inset-0 bg-black/50"
            onClick={() => setMobileNavOpen(false)}
          />
          {/* Panel */}
          <div className="relative flex h-full w-72 flex-col bg-brand-teal animate-slide-in-left shadow-2xl">
            {/* Header row */}
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
            {/* Nav links */}
            <nav className="flex flex-col gap-1 px-4 py-5">
              {[
                { label: 'Features',     href: '#features' },
                { label: 'Modules',      href: '#modules' },
                { label: 'Pricing',      href: '#pricing' },
                { label: 'Reviews',      href: '#testimonials' },
              ].map(({ label, href }) => (
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
            {/* CTA buttons */}
            <div className="mt-auto border-t border-white/10 px-4 py-5 flex flex-col gap-3">
              <Link
                href="/login"
                className="inline-flex items-center justify-center rounded-xl border border-white/40 px-4 py-2.5 text-sm font-semibold text-white hover:bg-white/10 transition-colors"
                onClick={() => setMobileNavOpen(false)}
              >
                Sign in
              </Link>
              <Link
                href="/register"
                className="inline-flex items-center justify-center gap-1.5 rounded-xl bg-white px-4 py-2.5 text-sm font-semibold text-brand-teal transition-colors shadow-sm"
                onClick={() => setMobileNavOpen(false)}
              >
                Get started free <ChevronRight className="h-3.5 w-3.5" />
              </Link>
            </div>
          </div>
        </div>
      )}

      <main>
        {/* ── Hero ───────────────────────────────────────────────────────── */}
        <section className="relative overflow-hidden bg-gradient-to-b from-slate-950 via-slate-900 to-slate-950 pt-24 pb-32">
          {/* Grid texture */}
          <div
            className="pointer-events-none absolute inset-0 opacity-[0.04]"
            style={{
              backgroundImage: `linear-gradient(to right,#fff 1px,transparent 1px),
                                linear-gradient(to bottom,#fff 1px,transparent 1px)`,
              backgroundSize: '60px 60px',
            }}
          />
          {/* Glow blobs — use CSS vars so no hex in JSX */}
          <div
            className="pointer-events-none absolute top-0 left-1/2 -translate-x-1/2 w-[900px] h-[500px] rounded-full blur-[120px]"
            style={{ background: 'color-mix(in srgb, var(--brand-teal) 10%, transparent)' }}
          />
          <div
            className="pointer-events-none absolute bottom-0 right-1/4 w-[400px] h-[300px] rounded-full blur-[100px]"
            style={{ background: 'color-mix(in srgb, var(--brand-yellow) 10%, transparent)' }}
          />

          <div className="relative mx-auto max-w-7xl px-6 lg:px-8 text-center">
            {/* ── Social Proof & Modules Badge ── */}
            <div className="flex flex-col items-center gap-5 mb-10 animate-in fade-in slide-in-from-top-4 duration-1000">
              <div className="inline-flex items-center gap-2 rounded-full border border-brand-teal/30 bg-brand-teal/10 px-4 py-1.5 text-xs font-semibold text-brand-teal">
                <Zap className="h-3.5 w-3.5" />
                20+ modules · Multi-tenant · Real-time
              </div>

              <div className="flex items-center gap-5 bg-white/[0.03] backdrop-blur-xl border border-white/[0.08] px-6 py-3 rounded-2xl shadow-[0_20px_50px_rgba(0,0,0,0.3)] group transition-all hover:bg-white/[0.05] hover:border-white/[0.12]">
                <div className="flex -space-x-3.5">
                  {SOCIAL_PROOF_AVATARS.map((url, i) => (
                    <div
                      key={i}
                      className="h-10 w-10 rounded-full border-2 border-slate-950 bg-slate-800 shadow-xl overflow-hidden transition-transform group-hover:scale-110"
                      style={{ transitionDelay: `${i * 50}ms` }}
                    >
                      <img
                        src={url}
                        alt="User"
                        className="w-full h-full object-cover"
                      />
                    </div>
                  ))}
                  <div className="flex h-10 w-10 items-center justify-center rounded-full border-2 border-slate-950 bg-slate-900 text-[10px] font-bold text-white shadow-xl transition-transform group-hover:scale-110">
                    +12k
                  </div>
                </div>

                <div className="h-10 w-px bg-white/10" />

                <div className="flex flex-col items-start leading-tight">
                  <div className="flex items-center gap-1.5">
                    <div className="flex -space-x-0.5">
                      {[1, 2, 3, 4, 5].map((i) => (
                        <Star key={i} className="h-3.5 w-3.5 fill-yellow-400 text-yellow-400 drop-shadow-[0_0_8px_rgba(250,204,21,0.4)]" />
                      ))}
                    </div>
                    <span className="text-xs font-black text-white tracking-wider uppercase">4.9/5 Rating</span>
                  </div>
                  <p className="text-[12px] text-slate-400 font-medium mt-1">
                    Trusted by <span className="text-white font-extrabold">100k+</span> repair shop owners
                  </p>
                </div>
              </div>
            </div>

            <h1 className="text-4xl sm:text-5xl lg:text-6xl font-extrabold text-white leading-[1.1] tracking-tight">
              The All-in-One POS for{' '}
              <span className="text-brand-teal">repair shops</span>{' '}
              &amp; retail
            </h1>

            <p className="mt-6 max-w-2xl mx-auto text-lg text-slate-400 leading-relaxed">
              Book repairs, ring up sales, manage inventory, staff and customers all from
              one cloud platform built for multi-branch businesses.
            </p>

            <div className="mt-10 flex flex-col sm:flex-row items-center justify-center gap-4">
              <Link
                href="/register"
                className="inline-flex items-center gap-2 rounded-xl bg-brand-teal hover:bg-brand-teal-dark px-8 py-3.5 text-base font-bold text-white transition-colors shadow-lg"
              >
                Start 30 Days free trial
                <ChevronRight className="h-4 w-4" />
              </Link>
              <Link
                href="#features"
                className="inline-flex items-center gap-2 rounded-xl border border-slate-700 hover:border-slate-500 bg-slate-800/60 hover:bg-slate-800 px-8 py-3.5 text-base font-semibold text-slate-300 transition-colors"
              >
                See features
              </Link>
            </div>

            <div className="mt-12 flex flex-wrap justify-center gap-4 animate-in fade-in slide-in-from-bottom-4 duration-1000 delay-200">
              {[
                { value: '20+', label: 'Integrated modules' },
                { value: '∞', label: 'Branches supported' },
                { value: '99.9%', label: 'Uptime SLA' },
              ].map(({ value, label }) => (
                <div
                  key={label}
                  className="flex items-center gap-3 rounded-full border border-slate-700/60 bg-slate-800/40 px-5 py-2.5 transition-colors hover:border-brand-teal/30 hover:bg-slate-800/60"
                >
                  <span className="text-xl font-extrabold text-brand-teal">{value}</span>
                  <span className="text-sm text-slate-400">{label}</span>
                </div>
              ))}
            </div>

            {/* ── Featured Testimonial Auto-Carousel ── */}
            <div className="mt-16 flex flex-col items-center gap-8">
              <div className="relative group max-w-lg w-full">
                {/* Glow Effect */}
                <div className="absolute -inset-2 bg-gradient-to-r from-brand-teal/20 to-blue-600/20 rounded-2xl blur-xl opacity-0 group-hover:opacity-100 transition-opacity duration-700"></div>

                <div className="relative flex flex-col sm:flex-row items-center gap-5 rounded-2xl border border-white/[0.08] bg-white/[0.02] backdrop-blur-md p-6 shadow-2xl transition-all hover:border-white/[0.12] hover:bg-white/[0.04] min-h-[160px]">
                  <div className="relative shrink-0 animate-in fade-in zoom-in duration-700" key={t.image}>
                    <img
                      src={t.image}
                      alt={t.author}
                      className="h-14 w-14 rounded-full border-2 border-brand-teal/30 shadow-lg object-cover"
                    />
                    <div className="absolute -bottom-1 -right-1 flex h-6 w-6 items-center justify-center rounded-full bg-brand-teal shadow-lg">
                      <Quote className="h-3 w-3 text-white fill-white" />
                    </div>
                  </div>

                  <div className="text-center sm:text-left animate-in fade-in slide-in-from-right-4 duration-700" key={t.quote}>
                    <p className="text-sm italic text-slate-300 leading-relaxed">
                      "{t.quote}"
                    </p>
                    <div className="mt-3 flex flex-wrap items-center justify-center sm:justify-start gap-2">
                      <span className="text-xs font-bold text-white">{t.author}</span>
                      <span className="text-[10px] text-slate-500 uppercase tracking-widest font-bold">{t.role}</span>
                      <div className="h-1 w-1 rounded-full bg-slate-700 mx-1" />
                      <div className="flex items-center gap-0.5">
                        {[1, 2, 3, 4, 5].map((star) => (
                          <Star key={star} className="h-2.5 w-2.5 fill-brand-yellow text-brand-yellow" />
                        ))}
                      </div>
                    </div>
                  </div>
                </div>

                {/* Carousel Indicators */}
                <div className="absolute -bottom-4 left-1/2 -translate-x-1/2 flex gap-1.5">
                  {TESTIMONIALS.map((_, i) => (
                    <button
                      key={i}
                      onClick={() => setActiveTestimonial(i)}
                      className={`h-1 rounded-full transition-all ${i === activeTestimonial ? 'w-4 bg-brand-teal' : 'w-1 bg-slate-700'}`}
                    />
                  ))}
                </div>
              </div>

              <div className="flex flex-col items-center gap-4 opacity-50 hover:opacity-100 transition-opacity duration-500">
                <p className="text-[10px] font-black text-slate-400 uppercase tracking-[0.3em]">Trusted by Global Retailers</p>
                <div className="flex flex-wrap justify-center gap-x-10 gap-y-4 font-black text-lg text-slate-400/50">
                  <span className="tracking-tighter italic">REPAIRLY</span>
                  <span className="tracking-tighter">TEK-PRO</span>
                  <span className="tracking-tighter italic">iFIX-IT</span>
                  <span className="tracking-tighter">NEXT-GEN</span>
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* ── Tabbed Feature Showcase ─────────────────────────────────── */}
        <section id="features" className="py-24 bg-[#faf8f4]">
          <div className="mx-auto max-w-7xl px-6 lg:px-8">
            <div className="text-center mb-12">
              <h2 className="text-3xl sm:text-4xl font-extrabold text-gray-900 tracking-tight">
                Repair Shop Management Control
              </h2>
              <p className="mt-4 max-w-2xl mx-auto text-gray-500">
                One feature-rich platform to consolidate, streamline, and manage your repair business operations.
              </p>
            </div>

            <FeatureTabs />
          </div>
        </section>

        {/* ── Feature Cards Grid ──────────────────────────────────────── */}
        <section className="py-24 bg-white">
          <div className="mx-auto max-w-7xl px-6 lg:px-8">
            <div className="text-center mb-16">
              <p className="text-sm font-semibold uppercase tracking-widest text-brand-teal mb-3">Core features</p>
              <h2 className="text-3xl sm:text-4xl font-extrabold text-gray-900 tracking-tight">
                Everything your shop needs
              </h2>
              <p className="mt-4 max-w-xl mx-auto text-gray-500">
                From the first repair booking to the final sale report — RepairBooking handles every part of your daily operation.
              </p>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-8">
              {FEATURE_CARDS.map(({ icon: Icon, title, desc, iconColor, iconBg, borderColor, shadowColor, hoverBorderColor, hoverShadowColor }) => (
                <div
                  key={title}
                  className={`group relative overflow-hidden rounded-3xl border bg-white p-8 shadow-md transition-all duration-500 ease-out hover:-translate-y-2 hover:shadow-xl ${borderColor} ${shadowColor} ${hoverBorderColor} ${hoverShadowColor}`}
                >
                  <div className="absolute inset-0 bg-gradient-to-br from-black/[0.01] to-transparent opacity-0 transition-opacity duration-500 group-hover:opacity-100" />

                  <div className={`relative inline-flex items-center justify-center w-14 h-14 rounded-2xl ${iconBg} mb-6 shadow-sm transition-transform duration-500 group-hover:scale-110 group-hover:-rotate-3`}>
                    <Icon className={`h-6 w-6 ${iconColor}`} strokeWidth={1.75} />
                  </div>
                  <h3 className={`relative text-lg font-bold text-gray-900 mb-3 transition-colors duration-300 group-hover:${iconColor}`}>{title}</h3>
                  <p className="relative text-sm text-gray-500 leading-relaxed">{desc}</p>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* ── All Modules ─────────────────────────────────────────────────── */}
        <section id="modules" className="py-24 bg-slate-950">
          <div className="mx-auto max-w-7xl px-6 lg:px-8">
            <div className="text-center mb-16">
              <p className="text-sm font-semibold uppercase tracking-widest text-brand-teal mb-3">Complete platform</p>
              <h2 className="text-3xl sm:text-4xl font-extrabold text-white tracking-tight">
                20+ Modules, One Subscription
              </h2>
              <p className="mt-4 max-w-xl mx-auto text-slate-400">
                No add-ons, no hidden fees. Every module is included from day one.
              </p>
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-3">
              {ALL_MODULES.map(({ icon: Icon, label }) => (
                <div
                  key={label}
                  className="flex items-center gap-3 rounded-xl border border-slate-800 bg-slate-900/60 hover:bg-slate-800/80 hover:border-brand-teal/40 px-4 py-3.5 transition-colors group"
                >
                  <Icon className="h-4 w-4 text-brand-teal flex-shrink-0" strokeWidth={1.75} />
                  <span className="text-sm font-medium text-slate-300 group-hover:text-white transition-colors">{label}</span>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* ── How it Works ────────────────────────────────────────────────── */}
        <section className="py-24 bg-gray-50">
          <div className="mx-auto max-w-7xl px-6 lg:px-8">
            <div className="text-center mb-16">
              <p className="text-sm font-semibold uppercase tracking-widest text-brand-teal mb-3">Quick setup</p>
              <h2 className="text-3xl sm:text-4xl font-extrabold text-gray-900 tracking-tight">
                Up and running in Minutes
              </h2>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-10">
              {STEPS.map(({ step, title, desc }) => (
                <div key={step} className="flex flex-col items-center text-center">
                  <div
                    className="flex items-center justify-center w-20 h-20 rounded-2xl mb-6 shadow-lg"
                    style={{ background: 'linear-gradient(135deg, var(--brand-teal), var(--brand-teal-dark))' }}
                  >
                    <span className="text-2xl font-black text-white">{step}</span>
                  </div>
                  <h3 className="text-lg font-bold text-gray-900 mb-2">{title}</h3>
                  <p className="text-sm text-gray-500 max-w-xs leading-relaxed">{desc}</p>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* ── Testimonials ────────────────────────────────────────────────── */}
        <section id="testimonials" className="py-24 bg-white">
          <div className="mx-auto max-w-7xl px-6 lg:px-8">
            <div className="text-center mb-16">
              <p className="text-sm font-semibold uppercase tracking-widest text-brand-teal mb-3">Customer stories</p>
              <h2 className="text-3xl sm:text-4xl font-extrabold text-gray-900 tracking-tight">
                Shops love RepairBooking
              </h2>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
              {TESTIMONIALS.map(({ quote, author, role, image }) => (
                <div
                  key={author}
                  className="group relative flex flex-col justify-between rounded-3xl border border-outline-variant/30 bg-white p-8 shadow-sm transition-all duration-500 ease-out hover:-translate-y-2 hover:border-primary/40 hover:shadow-[0_20px_40px_-10px_rgba(0,128,128,0.15)]"
                >
                  <Quote className="absolute top-8 right-8 h-12 w-12 text-primary/5 transition-transform duration-500 group-hover:scale-110 group-hover:text-primary/10 group-hover:-rotate-6" />

                  <div className="flex gap-1 mb-6">
                    {Array.from({ length: 5 }).map((_, i) => (
                      <Star key={i} className="h-4 w-4 text-brand-yellow fill-brand-yellow" />
                    ))}
                  </div>

                  <blockquote className="relative z-10 flex-1 text-[15px] text-gray-600 leading-relaxed mb-8">
                    &ldquo;{quote}&rdquo;
                  </blockquote>

                  <div className="flex items-center gap-4 mt-auto">
                    <div className="relative h-12 w-12 overflow-hidden rounded-full border-2 border-primary/20 transition-colors duration-300 group-hover:border-primary">
                      <img src={image} alt={author} className="h-full w-full object-cover" />
                    </div>
                    <div>
                      <p className="text-sm font-bold text-gray-900">{author}</p>
                      <p className="text-xs font-medium text-primary">{role}</p>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* ── Pricing ─────────────────────────────────────────────────────── */}
        <section id="pricing" className="py-24 bg-slate-950">
          <div className="mx-auto max-w-7xl px-6 lg:px-8">
            <div className="text-center mb-16">
              <p className="text-sm font-semibold uppercase tracking-widest text-brand-teal mb-3">Pricing</p>
              <h2 className="text-3xl sm:text-4xl font-extrabold text-white tracking-tight">
                Simple, transparent pricing
              </h2>
              <p className="mt-4 text-slate-400">All plans include a 30-day free trial. No credit card required.</p>

              {/* Billing toggle */}
              <div className="mt-8 inline-flex items-center gap-4 rounded-2xl border border-slate-700 bg-slate-900/80 p-1.5">
                <button
                  onClick={() => setBilling('monthly')}
                  className={`rounded-xl px-5 py-2 text-sm font-semibold transition-all ${billing === 'monthly' ? 'bg-brand-teal text-white shadow-md' : 'text-slate-400 hover:text-white'}`}
                >
                  Monthly
                </button>
                <button
                  onClick={() => setBilling('yearly')}
                  className={`relative rounded-xl px-5 py-2 text-sm font-semibold transition-all ${billing === 'yearly' ? 'bg-brand-teal text-white shadow-md' : 'text-slate-400 hover:text-white'}`}
                >
                  Annual
                  <span className="absolute -top-3 -right-3 rounded-full bg-brand-yellow px-1.5 py-0.5 text-[10px] font-black text-slate-900 shadow">
                    -20%
                  </span>
                </button>
              </div>
            </div>

            {plansLoading ? (
              /* ── Skeleton ── */
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
                {[0, 1, 2].map(i => (
                  <div key={i} className="rounded-2xl bg-slate-900 border border-slate-800 p-8 space-y-4 animate-pulse">
                    <div className="h-3 w-16 rounded bg-slate-800" />
                    <div className="h-10 w-28 rounded bg-slate-800" />
                    <div className="h-3 w-full rounded bg-slate-800" />
                    <div className="h-3 w-4/5 rounded bg-slate-800" />
                    <div className="mt-6 space-y-2.5">
                      {[1, 2, 3, 4].map(j => <div key={j} className="h-3 w-full rounded bg-slate-800" />)}
                    </div>
                    <div className="mt-8 h-11 w-full rounded-xl bg-slate-800" />
                  </div>
                ))}
              </div>
            ) : (
              <div className={`grid gap-6 items-stretch ${plans.length === 1 ? 'max-w-sm mx-auto' :
                plans.length === 2 ? 'grid-cols-1 sm:grid-cols-2 max-w-2xl mx-auto' :
                  'grid-cols-1 sm:grid-cols-2 lg:grid-cols-3'
                }`}>
                {plans.map((plan, idx) => {
                  const highlight = isHighlighted(plans, idx)
                  const isTrulyFree = plan.price_monthly === 0
                  const isEnterprise = plan.plan_type === 'enterprise'
                  const branches = plan.max_branches >= 50 ? '∞' : String(plan.max_branches)
                  const users = plan.max_users >= 999 ? '∞' : String(plan.max_users)
                  const isYearly = billing === 'yearly' && !isTrulyFree && !isEnterprise
                  const yearlyTotal = plan.price_yearly > 0 ? plan.price_yearly : Math.round(plan.price_monthly * 12 * 0.8)
                  const displayPrice = isYearly ? plan.price_monthly : plan.price_monthly
                  const fmtPrice = (n: number) => n % 1 === 0 ? String(Math.round(n)) : n.toFixed(2)

                  return (
                    <div
                      key={plan.id}
                      className={`relative flex flex-col rounded-2xl p-7 sm:p-8 transition-all duration-200 ${highlight
                        ? 'shadow-2xl lg:scale-[1.04] z-10'
                        : 'bg-slate-900 border border-slate-800 hover:border-slate-700'
                        }`}
                      style={highlight ? { background: 'var(--brand-teal)' } : {}}
                    >
                      {highlight && (
                        <div
                          className="absolute -top-4 left-1/2 -translate-x-1/2 rounded-full px-4 py-1.5 text-xs font-black text-slate-900 shadow-lg whitespace-nowrap"
                          style={{ background: 'var(--brand-yellow)' }}
                        >
                          Most popular
                        </div>
                      )}

                      {/* Plan name + price */}
                      <div className="mb-5">
                        <p className={`text-xs font-bold uppercase tracking-widest mb-3 ${highlight ? 'text-white/60' : 'text-slate-500'}`}>
                          {plan.name}
                        </p>

                        {/* 30-day free trial badge — all non-enterprise plans */}
                        {!isEnterprise && (
                          <div className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-bold mb-3 ${highlight ? 'bg-white/20 text-white' : 'bg-brand-teal/15 text-brand-teal'}`}>
                            <Gift className="h-3 w-3" />
                            30 days free trial
                          </div>
                        )}

                        <div className="flex items-end gap-1.5 mb-1">
                          {isEnterprise ? (
                            <span className="text-4xl sm:text-5xl font-black text-white">Custom</span>
                          ) : isYearly ? (
                            <>
                              <span className="text-4xl sm:text-5xl font-black text-white">£{yearlyTotal}</span>
                              <span className={`text-sm mb-2 ${highlight ? 'text-white/60' : 'text-slate-400'}`}>/yr</span>
                            </>
                          ) : (
                            <>
                              <span className="text-4xl sm:text-5xl font-black text-white">£{fmtPrice(displayPrice)}</span>
                              <span className={`text-sm mb-2 ${highlight ? 'text-white/60' : 'text-slate-400'}`}>/mo</span>
                            </>
                          )}
                        </div>

                        {/* Savings note or post-trial note */}
                        {!isEnterprise && (
                          <p className={`text-xs mb-3 ${highlight ? 'text-white/50' : 'text-slate-500'}`}>
                            {isTrulyFree
                              ? 'Free forever — no credit card required'
                              : isYearly
                                ? `Save £${Math.round(plan.price_monthly * 12) - yearlyTotal} vs monthly — after 30-day trial`
                                : `Then £${fmtPrice(plan.price_monthly)}/mo after 30-day trial`}
                          </p>
                        )}

                        <p className={`text-sm leading-relaxed ${highlight ? 'text-white/75' : 'text-slate-400'}`}>
                          {planDesc(plan)}
                        </p>
                      </div>

                      {/* Branch / staff stats */}
                      <div className={`flex gap-3 mb-5 pb-5 border-b ${highlight ? 'border-white/20' : 'border-slate-800'}`}>
                        <div className={`flex-1 text-center rounded-xl py-2.5 ${highlight ? 'bg-white/10' : 'bg-slate-800'}`}>
                          <p className="text-xl font-bold text-white">{branches}</p>
                          <p className={`text-[10px] uppercase tracking-wide mt-0.5 ${highlight ? 'text-white/50' : 'text-slate-500'}`}>Branches</p>
                        </div>
                        <div className={`flex-1 text-center rounded-xl py-2.5 ${highlight ? 'bg-white/10' : 'bg-slate-800'}`}>
                          <p className="text-xl font-bold text-white">{users}</p>
                          <p className={`text-[10px] uppercase tracking-wide mt-0.5 ${highlight ? 'text-white/50' : 'text-slate-500'}`}>Staff</p>
                        </div>
                      </div>

                      {/* Feature list */}
                      <ul className="flex-1 space-y-2.5 mb-7">
                        {(Array.isArray(plan.features) ? plan.features : []).map(f => (
                          <li key={f} className="flex items-start gap-2.5 text-sm">
                            <span className={`mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full ${highlight ? 'bg-white/15' : 'bg-brand-teal/10'}`}>
                              <Check className={`h-3 w-3 ${highlight ? 'text-white' : 'text-brand-teal'}`} />
                            </span>
                            <span className={highlight ? 'text-white/85' : 'text-slate-300'}>{fmtFeature(f)}</span>
                          </li>
                        ))}
                      </ul>

                      {/* CTA */}
                      <Link
                        href={planCtaHref(plan)}
                        className={`inline-flex items-center justify-center gap-2 rounded-xl px-6 py-3 text-sm font-bold transition-colors ${highlight
                          ? 'bg-white hover:bg-slate-100 text-brand-teal'
                          : 'border border-brand-teal/30 bg-brand-teal/10 hover:bg-brand-teal/20 text-brand-teal'
                          }`}
                      >
                        {planCta(plan)}
                        <ChevronRight className="h-3.5 w-3.5" />
                      </Link>
                    </div>
                  )
                })}
              </div>
            )}

            {/* Trust badges */}
            {!plansLoading && plans.length > 0 && (
              <div className="mt-12 flex flex-wrap justify-center gap-6 text-xs text-slate-500">
                {['No credit card required', 'Cancel anytime', 'Data export on request', '99.9% uptime SLA'].map(t => (
                  <span key={t} className="flex items-center gap-1.5">
                    <Check className="h-3 w-3 text-brand-teal" /> {t}
                  </span>
                ))}
              </div>
            )}
          </div>
        </section>

        {/* ── CTA ─────────────────────────────────────────────────────────── */}
        <section
          className="py-24 relative overflow-hidden"
          style={{ background: 'linear-gradient(135deg, var(--brand-teal), var(--brand-teal-dark))' }}
        >
          <div
            className="pointer-events-none absolute inset-0 opacity-10"
            style={{
              backgroundImage: `radial-gradient(circle,#fff 1px,transparent 1px)`,
              backgroundSize: '32px 32px',
            }}
          />
          <div className="relative mx-auto max-w-3xl px-6 lg:px-8 text-center">
            <h2 className="text-3xl sm:text-4xl font-extrabold text-white tracking-tight mb-4">
              Ready to transform your shop?
            </h2>
            <p className="text-lg text-white/80 mb-10 leading-relaxed">
              Join hundreds of repair shops already using RepairBooking to save time,
              reduce errors, and delight their customers.
            </p>
            <div className="flex flex-col sm:flex-row items-center justify-center gap-4">
              <Link
                href="/register"
                className="inline-flex items-center gap-2 rounded-xl bg-white hover:bg-gray-50 px-8 py-4 text-base font-bold transition-colors shadow-xl text-brand-teal"
              >
                Start your free 30-days trial
                <ChevronRight className="h-4 w-4" />
              </Link>
              <a
                href="tel:+447462254013"
                className="inline-flex items-center gap-2 rounded-xl border border-white/30 hover:bg-white/10 px-8 py-4 text-base font-semibold text-white transition-colors"
              >
                Talk to sales
              </a>
            </div>
            <p className="mt-6 text-sm text-white/60">No credit card required · Cancel anytime</p>
          </div>
        </section>
      </main>

      {/* ── Footer ─────────────────────────────────────────────────────── */}
      <footer className="bg-slate-950 border-t border-slate-800/60">
        <div className="mx-auto w-full max-w-[1600px] px-2 sm:px-6 lg:px-10 py-12">
          <div className="flex flex-col md:flex-row items-start justify-between gap-10">
            <div className="flex-shrink-0">
              <Image
                src="/images/tsn_logo.png"
                alt="The Social Nexus"
                width={280}
                height={72}
                className="h-16 w-auto mb-4"
              />
              <p className="text-sm text-slate-500 max-w-xs leading-relaxed">
                Cloud-based POS and repair booking platform for modern repair shops and multi-branch retailers.
              </p>
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-3 gap-8 text-sm">
              <div>
                <p className="font-semibold text-slate-300 mb-3">Product</p>
                <ul className="space-y-2 text-slate-500">
                  <li><Link href="#features" className="hover:text-brand-teal transition-colors">Features</Link></li>
                  <li><Link href="#modules" className="hover:text-brand-teal transition-colors">Modules</Link></li>
                  <li><Link href="#pricing" className="hover:text-brand-teal transition-colors">Pricing</Link></li>
                </ul>
              </div>
              <div>
                <p className="font-semibold text-slate-300 mb-3">Company</p>
                <ul className="space-y-2 text-slate-500">
                  <li><Link href="/about" className="hover:text-brand-teal transition-colors">About</Link></li>
                  <li><Link href="/blog" className="hover:text-brand-teal transition-colors">Blog</Link></li>
                  <li><a href="mailto:connect@repairbooking.co.uk" className="hover:text-brand-teal transition-colors">Contact</a></li>
                </ul>
              </div>
              <div>
                <p className="font-semibold text-slate-300 mb-3">Legal</p>
                <ul className="space-y-2 text-slate-500">
                  <li><Link href="/privacy" className="hover:text-brand-teal transition-colors">Privacy</Link></li>
                  <li><Link href="/terms" className="hover:text-brand-teal transition-colors">Terms</Link></li>
                </ul>
              </div>
            </div>
          </div>

          <div className="mt-10 pt-6 border-t border-slate-800 flex flex-col sm:flex-row items-center justify-between gap-3 text-xs text-slate-600">
            <p>© {new Date().getFullYear()} The Social Nexus Ltd. All rights reserved.</p>

          </div>
        </div>
      </footer>
    </>
  )
}
