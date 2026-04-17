'use client'
import { useEffect, useCallback } from 'react'
import { create } from 'zustand'
import type { ModuleName } from '@/types/module-config'
import type { Role } from '@/backend/config/constants'

const TOUR_STORAGE_KEY = (profileId: string) => `tour_done_${profileId}`

export interface TourStep {
  id: string
  title: string
  description: string
  bullets?: string[]
  href: string
  /**
   * CSS selector for the sidebar/page element to spotlight.
   * Use the sidebar link href, e.g. `a[href="/pos"]`.
   * Omit for Welcome / Finish steps (card centres on screen).
   */
  targetSelector?: string
  /** Only include if this module is enabled */
  module?: ModuleName
  /** Only include if user has at least this role */
  minRole?: Role
  iconName: string
  accentColor: string
}

// ── All possible tour steps in display order ──────────────────────────────────
export const ALL_TOUR_STEPS: TourStep[] = [
  {
    id: 'welcome',
    title: 'Welcome aboard! 🎉',
    description:
      "This quick tour will walk you through every feature available on your plan. Click Next to explore each module, or Skip if you'd rather dive straight in.",
    href: '/dashboard',
    iconName: 'Sparkles',
    accentColor: '#6366f1',
  },
  {
    id: 'dashboard',
    title: 'Dashboard',
    description:
      'Your command centre. Get a live snapshot of sales, repairs, stock alerts and upcoming appointments — all in one place.',
    bullets: ["Today's revenue & transaction count", 'Low stock & pending repair alerts', 'Quick-action shortcuts'],
    href: '/dashboard',
    targetSelector: 'a[href="/dashboard"]',
    iconName: 'LayoutDashboard',
    accentColor: '#008080',
  },
  {
    id: 'pos',
    title: 'Point of Sale (POS)',
    description:
      'Process sales fast with a full-featured till. Supports cash, card, split payments, discounts and loyalty redemption.',
    bullets: ['Barcode scanning & quick-add products', 'Split & partial payments', 'Instant receipt printing'],
    href: '/pos',
    targetSelector: 'a[href="/pos"]',
    module: 'pos',
    iconName: 'ShoppingCart',
    accentColor: '#0ea5e9',
  },
  {
    id: 'sales',
    title: 'Sales History',
    description:
      'Every transaction is recorded and searchable. Void, refund or reprint receipts for any past sale.',
    bullets: ['Filter by date, cashier or product', 'One-click refunds', 'Export to CSV'],
    href: '/sales',
    targetSelector: 'a[href="/sales"]',
    module: 'pos',
    iconName: 'Receipt',
    accentColor: '#0ea5e9',
  },
  {
    id: 'repairs',
    title: 'Repair Tickets',
    description:
      'Manage the full repair lifecycle — from intake to handoff. Track device condition, assigned technician and customer updates.',
    bullets: ['Custom status workflow', 'Auto SMS/email on status change', 'Parts deduction from inventory'],
    href: '/repairs',
    targetSelector: 'a[href="/repairs"]',
    module: 'repairs',
    iconName: 'Wrench',
    accentColor: '#f97316',
  },
  {
    id: 'inventory',
    title: 'Inventory',
    description:
      'Keep your stock accurate with real-time tracking, low-stock alerts and product variants.',
    bullets: ['Barcode & serial number support', 'Bulk import via CSV', 'Automatic deduction on sale/repair'],
    href: '/inventory',
    targetSelector: 'a[href="/inventory"]',
    module: 'inventory',
    iconName: 'Package',
    accentColor: '#8b5cf6',
  },
  {
    id: 'customers',
    title: 'Customers',
    description:
      'Build your customer database with full purchase history, loyalty points and notes.',
    bullets: ['Loyalty points & store credit', 'Repair & purchase history per customer', 'Quick search by name, phone or email'],
    href: '/customers',
    targetSelector: 'a[href="/customers"]',
    module: 'customers',
    iconName: 'Users',
    accentColor: '#ec4899',
  },
  {
    id: 'appointments',
    title: 'Appointments',
    description:
      'Let customers book online or schedule in-store. Manage your calendar with buffer times and working hours.',
    bullets: ['Online booking widget for your website', 'Staff assignment & availability', 'Reminder notifications'],
    href: '/appointments',
    targetSelector: 'a[href="/appointments"]',
    module: 'appointments',
    iconName: 'Calendar',
    accentColor: '#14b8a6',
  },
  {
    id: 'invoices',
    title: 'Invoices',
    description:
      'Create professional invoices with your logo and brand colours. Send via email and track payment status.',
    bullets: ['PDF generation', 'Automated payment reminders', 'Partial & full payment tracking'],
    href: '/invoices',
    targetSelector: 'a[href="/invoices"]',
    module: 'invoices',
    iconName: 'FileText',
    accentColor: '#64748b',
  },
  {
    id: 'gift-cards',
    title: 'Gift Cards',
    description:
      'Sell branded gift cards in-store or online. View balances, redemption history and issue store credit.',
    bullets: ['Custom card values', 'Partial redemption support', 'Expiry date control'],
    href: '/gift-cards',
    targetSelector: 'a[href="/gift-cards"]',
    module: 'gift_cards',
    iconName: 'Gift',
    accentColor: '#f43f5e',
  },
  {
    id: 'expenses',
    title: 'Expenses',
    description:
      'Log business expenses with categories and receipts. Keep your P&L accurate without a separate accounting tool.',
    bullets: ['Receipt photo upload', 'Category-level reporting', 'Approval workflows'],
    href: '/expenses',
    targetSelector: 'a[href="/expenses"]',
    module: 'expenses',
    minRole: 'branch_manager',
    iconName: 'DollarSign',
    accentColor: '#eab308',
  },
  {
    id: 'employees',
    title: 'Employees',
    description:
      'Manage your team roles, shift hours, commissions and payroll — all linked to your branch.',
    bullets: ['Time tracking & timesheets', 'Commission on repairs & sales', 'Payroll export'],
    href: '/employees',
    targetSelector: 'a[href="/employees"]',
    module: 'employees',
    minRole: 'branch_manager',
    iconName: 'UserCheck',
    accentColor: '#10b981',
  },
  {
    id: 'reports',
    title: 'Reports & Analytics',
    description:
      'Deep-dive into your business performance. Every report can be filtered by date range and exported.',
    bullets: ['Sales, P&L, Tax, Repairs, Payments', 'Z-Report for end of day', 'Employee performance metrics'],
    href: '/reports',
    targetSelector: 'a[href="/reports"]',
    module: 'reports',
    minRole: 'branch_manager',
    iconName: 'BarChart2',
    accentColor: '#6366f1',
  },
  {
    id: 'messages',
    title: 'Internal Messages',
    description:
      'Communicate securely with staff across all branches. Supports group threads and file sharing.',
    bullets: ['Branch-to-branch messaging', 'Unread badge notifications', 'Message history'],
    href: '/messages',
    targetSelector: 'a[href="/messages"]',
    module: 'messages',
    iconName: 'MessageSquare',
    accentColor: '#008080',
  },
  {
    id: 'google-reviews',
    title: 'Google Reviews',
    description:
      'Send automatic review requests after a sale or repair is completed. Boost your online reputation with minimal effort.',
    bullets: ['Auto-trigger after sale/repair', 'Review link customisation', 'Response tracking'],
    href: '/google-reviews',
    targetSelector: 'a[href="/google-reviews"]',
    module: 'google_reviews',
    minRole: 'branch_manager',
    iconName: 'Star',
    accentColor: '#f59e0b',
  },
  {
    id: 'settings',
    title: 'Settings',
    description:
      'Configure your business details, branch info, invoice branding, module toggles and team permissions.',
    bullets: ['Invoice & receipt design', 'Module enable/disable per branch', 'Notification templates'],
    href: '/settings',
    targetSelector: 'a[href="/settings"]',
    minRole: 'branch_manager',
    iconName: 'Settings',
    accentColor: '#475569',
  },
  {
    id: 'finish',
    title: "You're all set! 🚀",
    description:
      "That's everything on your plan. Explore at your own pace — you can always replay this tour from your Account settings.",
    href: '/dashboard',
    iconName: 'CheckCircle',
    accentColor: '#008080',
  },
]

const ROLE_HIERARCHY: Role[] = ['cashier', 'staff', 'branch_manager', 'business_owner', 'super_admin']

function hasRole(userRole: string, required: Role): boolean {
  return ROLE_HIERARCHY.indexOf(userRole as Role) >= ROLE_HIERARCHY.indexOf(required)
}

/** Filter ALL_TOUR_STEPS down to only the steps relevant for the current user */
export function buildTourSteps(
  enabledModules: Set<ModuleName>,
  userRole: string
): TourStep[] {
  return ALL_TOUR_STEPS.filter((step) => {
    if (step.module && !enabledModules.has(step.module)) return false
    if (step.minRole && !hasRole(userRole, step.minRole)) return false
    return true
  })
}

// ── Shared Zustand store — all components read/write the same state ───────────
interface TourStore {
  isActive: boolean
  stepIndex: number
  setActive: (v: boolean) => void
  setStepIndex: (fn: (i: number) => number) => void
  resetStep: () => void
}

const useTourStore = create<TourStore>((set) => ({
  isActive: false,
  stepIndex: 0,
  setActive: (v) => set({ isActive: v }),
  setStepIndex: (fn) => set((s) => ({ stepIndex: fn(s.stepIndex) })),
  resetStep: () => set({ stepIndex: 0 }),
}))

// ── Hook ──────────────────────────────────────────────────────────────────────

export function useTour(profileId: string | null) {
  const { isActive, stepIndex, setActive, setStepIndex, resetStep } = useTourStore()

  // Show tour automatically for new users (no localStorage entry)
  useEffect(() => {
    if (!profileId) return
    const done = localStorage.getItem(TOUR_STORAGE_KEY(profileId))
    if (!done) {
      const timer = setTimeout(() => setActive(true), 1800)
      return () => clearTimeout(timer)
    }
  }, [profileId]) // eslint-disable-line react-hooks/exhaustive-deps

  const finish = useCallback(() => {
    if (profileId) {
      localStorage.setItem(TOUR_STORAGE_KEY(profileId), '1')
    }
    setActive(false)
    resetStep()
  }, [profileId]) // eslint-disable-line react-hooks/exhaustive-deps

  const next = useCallback((totalSteps: number) => {
    setStepIndex((i) => Math.min(i + 1, totalSteps - 1))
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  const back = useCallback(() => {
    setStepIndex((i) => Math.max(0, i - 1))
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  /** Called from Account Settings "Replay tour" button */
  const restart = useCallback(() => {
    if (profileId) {
      localStorage.removeItem(TOUR_STORAGE_KEY(profileId))
    }
    resetStep()
    setActive(true)
  }, [profileId]) // eslint-disable-line react-hooks/exhaustive-deps

  return { isActive, stepIndex, next, back, finish, restart }
}
