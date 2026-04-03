'use client'
import { useState } from 'react'
import {
  Package, CreditCard, Calendar, ShoppingCart,
  Bell, UserCheck, BarChart3, Wrench, Check, ChevronRight,
} from 'lucide-react'
import Link from 'next/link'
import { cn } from '@/lib/utils'

const FEATURE_TABS = [
  {
    id: 'inventory',
    icon: Package,
    label: 'Inventory Management',
    title: 'Inventory Management',
    desc: 'Take full control of your stock across every location. Track quantities in real time, set automatic low-stock alerts, manage purchase orders, and run stock adjustments — all from one screen. Whether you sell parts, accessories, or finished goods, our multi-location inventory system keeps everything in sync.',
    highlights: ['Real-time stock tracking across branches', 'Low-stock alerts & auto-reorder points', 'Purchase orders & supplier management', 'Barcode scanning & batch operations'],
  },
  {
    id: 'payments',
    icon: CreditCard,
    label: 'Integrated Payments',
    title: 'Integrated Payments',
    desc: 'Accept payments your way — cash, card, split payments, gift cards, or store credit. Every transaction is recorded instantly, synced with your inventory, and attached to the customer profile. Generate invoices, process refunds, and reconcile your books without switching tabs.',
    highlights: ['Cash, card, split & gift card payments', 'Automatic invoice generation', 'Refunds & store credit management', 'End-of-day register reconciliation'],
  },
  {
    id: 'appointments',
    icon: Calendar,
    label: 'Appointment Scheduling',
    title: 'Appointment Scheduling',
    desc: 'Let customers book repair drop-offs and service appointments online. Your staff sees a live calendar with colour-coded time slots, automated reminders reduce no-shows, and each booking links directly to the repair ticket workflow.',
    highlights: ['Online customer booking portal', 'Staff calendar with drag-and-drop', 'SMS & email appointment reminders', 'Direct link to repair tickets'],
  },
  {
    id: 'pos',
    icon: ShoppingCart,
    label: 'Point of Sale Software',
    title: 'Point of Sale',
    desc: 'Generate more revenue and provide a great checkout experience to your customers with a comprehensive POS system that has everything you need for your business operations. Sell repair services, accessories and gadgets, generate and print invoices, collect payments, and more — all from a single POS screen. Fast, efficient, reliable, and tailor-made for your store\'s workflow.',
    highlights: ['Barcode scanning & quick search', 'Split payments & gift card redemption', 'Real-time inventory deduction', 'Receipt printing & email invoices'],
  },
  {
    id: 'notifications',
    icon: Bell,
    label: 'SMS and Email Notification',
    title: 'SMS & Email Notifications',
    desc: 'Keep your customers in the loop at every step. Send automated status updates when a repair moves to a new stage, appointment reminders before their visit, and promotional messages to drive repeat business — all configurable per branch.',
    highlights: ['Automated repair status SMS/email', 'Appointment reminder notifications', 'Custom notification templates', 'Per-branch notification rules'],
  },
  {
    id: 'employees',
    icon: UserCheck,
    label: 'Employee Management',
    title: 'Employee Management',
    desc: 'Manage your entire team from one dashboard. Assign roles with granular permissions, track clock-in/clock-out times, calculate commissions, and monitor per-employee performance. Multi-branch managers can oversee staff across every location.',
    highlights: ['Role-based access control', 'Time clock & attendance tracking', 'Commission & payroll reports', 'Cross-branch staff management'],
  },
  {
    id: 'reports',
    icon: BarChart3,
    label: 'Business Reporting',
    title: 'Business Reporting',
    desc: 'Make data-driven decisions with comprehensive reports. Track sales trends, profit and loss, branch-level revenue, staff performance, and repair turnaround times. Export to CSV or PDF, schedule automated report emails, and compare periods at a glance.',
    highlights: ['Sales, P&L & revenue dashboards', 'Per-branch & per-staff breakdowns', 'Repair turnaround analytics', 'CSV/PDF export & scheduled emails'],
  },
  {
    id: 'repairs',
    icon: Wrench,
    label: 'Repair Ticket Management',
    title: 'Repair Ticket Management',
    desc: 'Track every repair job from intake to pickup with a powerful ticket workflow. Attach photos, log parts used, set custom statuses, and automatically notify customers at each stage. Condition labels, warranty tracking, and estimate approvals are built right in.',
    highlights: ['Custom status workflows & labels', 'Photo attachments & condition notes', 'Parts tracking & cost estimation', 'Warranty management & auto-notifications'],
  },
]

const TAB_COLORS: Record<string, { text: string; bg: string; border: string; btnBg: string; btnHover: string }> = {
  inventory:     { text: 'text-indigo-600',   bg: 'bg-indigo-50',        border: 'border-indigo-500',   btnBg: 'bg-indigo-600',   btnHover: 'hover:bg-indigo-700' },
  payments:      { text: 'text-amber-600',    bg: 'bg-amber-50',         border: 'border-amber-500',    btnBg: 'bg-amber-600',    btnHover: 'hover:bg-amber-700' },
  appointments:  { text: 'text-brand-teal',   bg: 'bg-brand-teal-light', border: 'border-brand-teal',   btnBg: 'bg-brand-teal',   btnHover: 'hover:bg-brand-teal-dark' },
  pos:           { text: 'text-emerald-600',  bg: 'bg-emerald-50',       border: 'border-emerald-500',  btnBg: 'bg-emerald-600',  btnHover: 'hover:bg-emerald-700' },
  notifications: { text: 'text-rose-600',     bg: 'bg-rose-50',          border: 'border-rose-500',     btnBg: 'bg-rose-600',     btnHover: 'hover:bg-rose-700' },
  employees:     { text: 'text-violet-600',   bg: 'bg-violet-50',        border: 'border-violet-500',   btnBg: 'bg-violet-600',   btnHover: 'hover:bg-violet-700' },
  reports:       { text: 'text-sky-600',      bg: 'bg-sky-50',           border: 'border-sky-500',      btnBg: 'bg-sky-600',      btnHover: 'hover:bg-sky-700' },
  repairs:       { text: 'text-orange-600',   bg: 'bg-orange-50',        border: 'border-orange-500',   btnBg: 'bg-orange-600',   btnHover: 'hover:bg-orange-700' },
}

export function FeatureTabs() {
  const tabs = FEATURE_TABS
  const [activeId, setActiveId] = useState(tabs[0].id)
  const active = tabs.find((t) => t.id === activeId)!
  const colors = TAB_COLORS[activeId]

  return (
    <div>
      {/* Tab bar — wraps on smaller screens */}
      <div className="flex flex-wrap items-center justify-center gap-1 mb-12">
        {tabs.map(({ id, icon: Icon, label }) => {
          const isActive = id === activeId
          const c = TAB_COLORS[id]
          return (
            <button
              key={id}
              onClick={() => setActiveId(id)}
              className={cn(
                'flex flex-col items-center gap-2 px-5 py-3.5 rounded-xl text-center transition-all duration-200 min-w-[110px]',
                isActive
                  ? `${c.bg} border-b-2 ${c.border}`
                  : 'hover:bg-gray-50'
              )}
            >
              <Icon
                className={cn(
                  'h-6 w-6 transition-colors',
                  isActive ? c.text : 'text-gray-400'
                )}
                strokeWidth={1.5}
              />
              <span
                className={cn(
                  'text-xs font-semibold leading-tight transition-colors whitespace-nowrap',
                  isActive ? 'text-gray-900' : 'text-gray-500'
                )}
              >
                {label}
              </span>
            </button>
          )
        })}
      </div>

      {/* Active tab content */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-12 items-center">
        {/* Left: visual placeholder */}
        <div className="relative">
          <div className="rounded-2xl border border-gray-100 bg-gradient-to-br from-gray-50 to-white p-8 shadow-sm">
            <div className="flex items-center gap-2 mb-6">
              <div className="h-3 w-3 rounded-full bg-red-300" />
              <div className="h-3 w-3 rounded-full bg-yellow-300" />
              <div className="h-3 w-3 rounded-full bg-green-300" />
            </div>
            {/* Skeleton app UI */}
            <div className="space-y-3">
              <div className="flex gap-3">
                <div className="h-8 w-28 rounded-lg bg-brand-teal/10" />
                <div className="h-8 w-20 rounded-lg bg-gray-100" />
                <div className="h-8 w-24 rounded-lg bg-gray-100" />
                <div className="h-8 flex-1 rounded-lg bg-gray-100" />
              </div>
              <div className="grid grid-cols-3 gap-3">
                <div className="h-24 rounded-xl bg-brand-teal/5 border border-brand-teal/10" />
                <div className="h-24 rounded-xl bg-brand-yellow/5 border border-brand-yellow/10" />
                <div className="h-24 rounded-xl bg-indigo-50 border border-indigo-100" />
              </div>
              <div className="h-32 rounded-xl bg-gray-50 border border-gray-100" />
              <div className="flex gap-3">
                <div className="h-10 w-32 rounded-lg bg-brand-teal/20" />
                <div className="h-10 w-28 rounded-lg bg-gray-100" />
              </div>
            </div>
          </div>
          {/* Decorative sparkles */}
          <div className="absolute -top-3 -left-3 w-6 h-6 text-brand-yellow opacity-40">✦</div>
          <div className="absolute -bottom-2 -right-2 w-6 h-6 text-brand-teal opacity-40">✦</div>
        </div>

        {/* Right: text content */}
        <div>
          <h3 className="text-2xl sm:text-3xl font-extrabold text-gray-900 tracking-tight mb-4">
            {active.title}
          </h3>
          <p className="text-gray-500 leading-relaxed mb-6">
            {active.desc}
          </p>
          <ul className="space-y-3 mb-8">
            {active.highlights.map((h) => (
              <li key={h} className="flex items-start gap-3">
                <div className={cn('mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full', colors.bg)}>
                  <Check className={cn('h-3 w-3', colors.text)} strokeWidth={3} />
                </div>
                <span className="text-sm text-gray-600">{h}</span>
              </li>
            ))}
          </ul>
          <Link
            href="/register"
            className={cn('inline-flex items-center gap-2 rounded-xl px-6 py-3 text-sm font-bold text-white transition-colors shadow-sm', colors.btnBg, colors.btnHover)}
          >
            Get Started
            <ChevronRight className="h-4 w-4" />
          </Link>
        </div>
      </div>
    </div>
  )
}
