import Image from 'next/image'
import Link from 'next/link'
import {
  Wrench, Package, Users, BarChart3, CreditCard, Calendar,
  Bell, FileText, MessageSquare, Star, Gift, Settings2,
  Building2, Clock, Shield, Zap, ChevronRight, Check, Menu,
  Phone, DollarSign, UserCheck, ShoppingCart
} from 'lucide-react'

// ─── Feature Cards (Screenshot 2 style) ───────────────────────────────────

const FEATURE_CARDS = [
  {
    icon: Wrench,
    title: 'Repair Management',
    desc: 'Track every repair job from intake to pickup. Custom statuses, parts tracking, and automated customer notifications.',
    iconColor: 'text-brand-teal',
    iconBg: 'bg-brand-teal-light',
  },
  {
    icon: CreditCard,
    title: 'Point of Sale',
    desc: 'Fast, intuitive POS with barcode scanning, split payments, gift cards, and real-time inventory deductions.',
    iconColor: 'text-brand-yellow-dark',
    iconBg: 'bg-brand-yellow-light',
  },
  {
    icon: Package,
    title: 'Inventory Control',
    desc: 'Multi-location stock management with low-stock alerts, stock adjustments, and purchase order tracking.',
    iconColor: 'text-indigo-600',
    iconBg: 'bg-indigo-50',
  },
  {
    icon: Users,
    title: 'Customer CRM',
    desc: 'Full customer history, repair logs, purchase records, and built-in communication tools.',
    iconColor: 'text-emerald-600',
    iconBg: 'bg-emerald-50',
  },
  {
    icon: BarChart3,
    title: 'Reports & Analytics',
    desc: 'Sales, profit & loss, branch revenue, staff performance, and repair turnaround — all in one dashboard.',
    iconColor: 'text-violet-600',
    iconBg: 'bg-violet-50',
  },
  {
    icon: Building2,
    title: 'Multi-Branch',
    desc: 'Manage all your locations from one account. Per-branch reporting, staff, inventory, and inter-branch calling.',
    iconColor: 'text-rose-600',
    iconBg: 'bg-rose-50',
  },
]

const ALL_MODULES = [
  { icon: Wrench,         label: 'Repair Booking' },
  { icon: ShoppingCart,   label: 'Point of Sale' },
  { icon: Package,        label: 'Inventory Management' },
  { icon: Users,          label: 'Customer CRM' },
  { icon: Calendar,       label: 'Appointments' },
  { icon: BarChart3,      label: 'Reports & Analytics' },
  { icon: FileText,       label: 'Invoicing' },
  { icon: Gift,           label: 'Gift Cards & Store Credit' },
  { icon: DollarSign,     label: 'Expense Tracking' },
  { icon: MessageSquare,  label: 'Internal Messaging' },
  { icon: Star,           label: 'Google Reviews' },
  { icon: Clock,          label: 'Employee Time Clock' },
  { icon: UserCheck,      label: 'Staff & Roles' },
  { icon: Building2,      label: 'Multi-Branch Management' },
  { icon: Bell,           label: 'Smart Notifications' },
  { icon: Phone,          label: 'WebRTC Branch Calls' },
  { icon: Settings2,      label: 'Custom Fields' },
  { icon: Shield,         label: 'Role-Based Access' },
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

const PLANS = [
  {
    name: 'Starter',
    price: '£29',
    period: '/mo',
    desc: 'Perfect for single-location repair shops just getting started.',
    features: [
      '1 branch',
      'Up to 3 staff accounts',
      'POS & Repairs',
      'Basic inventory',
      'Email support',
    ],
    cta: 'Get started free',
    highlight: false,
  },
  {
    name: 'Growth',
    price: '£79',
    period: '/mo',
    desc: 'For growing shops that need more power and team features.',
    features: [
      'Up to 3 branches',
      'Unlimited staff',
      'All 18 modules',
      'Advanced reports',
      'Priority support',
    ],
    cta: 'Start free trial',
    highlight: true,
  },
  {
    name: 'Enterprise',
    price: 'Custom',
    period: '',
    desc: 'For chains and franchises that need full control and SLA guarantees.',
    features: [
      'Unlimited branches',
      'Dedicated onboarding',
      'Custom integrations',
      'SLA 99.9% uptime',
      'Dedicated account manager',
    ],
    cta: 'Contact sales',
    highlight: false,
  },
]

const TESTIMONIALS = [
  {
    quote: "Switched from three separate tools to RepairBooking — our team saves hours every week and customers love the automated status texts.",
    name: "James Harrington",
    role: "Owner, iFixIt Manchester",
    initials: "JH",
  },
  {
    quote: "The multi-branch dashboard is a game changer. I can see revenue, open repairs, and low-stock alerts for all my shops from one screen.",
    name: "Priya Nair",
    role: "Director, TechFix Stores (4 branches)",
    initials: "PN",
  },
  {
    quote: "Setup took less than an hour. The repair workflow is exactly what we needed — intake photos, parts, status history, everything.",
    name: "Carlos Mendez",
    role: "Manager, QuickFix Express",
    initials: "CM",
  },
]

import { FeatureTabs } from '@/components/shared/feature-tabs'

// ─── Page ─────────────────────────────────────────────────────────────────
export default function HomePage() {
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
            <button className="md:hidden p-2 rounded-md text-white/80 hover:text-white" aria-label="Open menu">
              <Menu className="h-5 w-5" />
            </button>
          </div>
        </nav>
      </header>

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
            {/* Badge */}
            <div className="inline-flex items-center gap-2 rounded-full border border-brand-teal/30 bg-brand-teal/10 px-4 py-1.5 text-xs font-semibold text-brand-teal mb-8">
              <Zap className="h-3.5 w-3.5" />
              18 modules · Multi-tenant · Real-time
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
                Start free trial
                <ChevronRight className="h-4 w-4" />
              </Link>
              <Link
                href="#features"
                className="inline-flex items-center gap-2 rounded-xl border border-slate-700 hover:border-slate-500 bg-slate-800/60 hover:bg-slate-800 px-8 py-3.5 text-base font-semibold text-slate-300 transition-colors"
              >
                See features
              </Link>
            </div>

            <p className="mt-10 text-sm text-slate-500">
              Trusted by repair shops, electronics stores, and multi-branch retailers
            </p>

            <div className="mt-6 flex flex-wrap justify-center gap-4">
              {[
                { value: '18', label: 'Integrated modules' },
                { value: '∞', label: 'Branches supported' },
                { value: '99.9%', label: 'Uptime SLA' },
              ].map(({ value, label }) => (
                <div
                  key={label}
                  className="flex items-center gap-3 rounded-full border border-slate-700/60 bg-slate-800/40 px-5 py-2.5"
                >
                  <span className="text-xl font-extrabold text-brand-teal">{value}</span>
                  <span className="text-sm text-slate-400">{label}</span>
                </div>
              ))}
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

            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
              {FEATURE_CARDS.map(({ icon: Icon, title, desc, iconColor, iconBg }) => (
                <div
                  key={title}
                  className="group rounded-2xl border border-gray-100 bg-white p-7 hover:shadow-lg hover:shadow-gray-100/80 hover:-translate-y-1 transition-all duration-200"
                >
                  <div className={`inline-flex items-center justify-center w-12 h-12 rounded-2xl ${iconBg} mb-5`}>
                    <Icon className={`h-5 w-5 ${iconColor}`} strokeWidth={1.75} />
                  </div>
                  <h3 className="text-base font-bold text-gray-900 mb-2">{title}</h3>
                  <p className="text-sm text-gray-500 leading-relaxed">{desc}</p>
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
                18 modules, one subscription
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
                Up and running in an hour
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
              {TESTIMONIALS.map(({ quote, name, role, initials }) => (
                <div
                  key={name}
                  className="flex flex-col rounded-2xl border border-gray-100 bg-white p-8 shadow-sm hover:shadow-md transition-shadow"
                >
                  <div className="flex gap-1 mb-5">
                    {Array.from({ length: 5 }).map((_, i) => (
                      <Star key={i} className="h-4 w-4 text-brand-yellow fill-brand-yellow" />
                    ))}
                  </div>
                  <blockquote className="flex-1 text-sm text-gray-600 leading-relaxed mb-6">
                    &ldquo;{quote}&rdquo;
                  </blockquote>
                  <div className="flex items-center gap-3">
                    <div
                      className="flex items-center justify-center w-10 h-10 rounded-full text-white text-xs font-bold flex-shrink-0"
                      style={{ background: 'linear-gradient(135deg, var(--brand-teal), var(--brand-teal-dark))' }}
                    >
                      {initials}
                    </div>
                    <div>
                      <p className="text-sm font-semibold text-gray-900">{name}</p>
                      <p className="text-xs text-gray-500">{role}</p>
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
              <p className="mt-4 text-slate-400">All plans include a 14-day free trial. No credit card required.</p>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-8 items-center">
              {PLANS.map(({ name, price, period, desc, features, cta, highlight }) => (
                <div
                  key={name}
                  className={`relative flex flex-col rounded-2xl p-8 transition-all duration-200 ${
                    highlight
                      ? 'shadow-2xl md:scale-[1.04]'
                      : 'bg-slate-900 border border-slate-800 hover:border-slate-700'
                  }`}
                  style={highlight ? { background: 'var(--brand-teal)' } : {}}
                >
                  {highlight && (
                    <div
                      className="absolute -top-4 left-1/2 -translate-x-1/2 rounded-full px-4 py-1 text-xs font-black text-slate-900 shadow-lg whitespace-nowrap"
                      style={{ background: 'var(--brand-yellow)' }}
                    >
                      Most popular
                    </div>
                  )}
                  <div className="mb-6">
                    <p className={`text-sm font-semibold mb-1 ${highlight ? 'text-white/70' : 'text-slate-400'}`}>{name}</p>
                    <div className="flex items-end gap-1 mb-3">
                      <span className="text-4xl font-black text-white">{price}</span>
                      {period && <span className={`text-sm mb-1.5 ${highlight ? 'text-white/70' : 'text-slate-400'}`}>{period}</span>}
                    </div>
                    <p className={`text-sm leading-relaxed ${highlight ? 'text-white/80' : 'text-slate-400'}`}>{desc}</p>
                  </div>
                  <ul className="flex-1 space-y-3 mb-8">
                    {features.map((f) => (
                      <li key={f} className="flex items-center gap-2.5">
                        <Check className={`h-4 w-4 flex-shrink-0 ${highlight ? 'text-white' : 'text-brand-teal'}`} />
                        <span className={`text-sm ${highlight ? 'text-white/90' : 'text-slate-300'}`}>{f}</span>
                      </li>
                    ))}
                  </ul>
                  <Link
                    href="/register"
                    className={`inline-flex items-center justify-center gap-2 rounded-xl px-6 py-3 text-sm font-bold transition-colors ${
                      highlight
                        ? 'bg-white hover:bg-slate-100 text-brand-teal'
                        : 'border border-brand-teal/30 bg-brand-teal/10 hover:bg-brand-teal/20 text-brand-teal'
                    }`}
                  >
                    {cta}
                    <ChevronRight className="h-3.5 w-3.5" />
                  </Link>
                </div>
              ))}
            </div>
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
                Start your free 14-day trial
                <ChevronRight className="h-4 w-4" />
              </Link>
              <a
                href="mailto:hello@repairbooking.co.uk"
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
        <div className="mx-auto max-w-7xl px-6 lg:px-8 py-12">
          <div className="flex flex-col md:flex-row items-start justify-between gap-10">
            <div className="flex-shrink-0">
              <Image
                src="/images/tsn_logo.png"
                alt="The Social Nexus"
                width={140}
                height={36}
                className="h-8 w-auto mb-4"
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
                  <li><a href="mailto:hello@repairbooking.co.uk" className="hover:text-brand-teal transition-colors">Contact</a></li>
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
            <p>Built with ♥ for repair shops everywhere</p>
          </div>
        </div>
      </footer>
    </>
  )
}
