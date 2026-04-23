import { create } from 'zustand'
import { persist } from 'zustand/middleware'

interface DashboardStats {
  total_sales: number
  sales_count: number
  repairs_open: number
  repairs_completed: number
  repairs_urgent: number
  total_expenses: number
  low_stock_count: number
}

interface BranchRevenue {
  branchId: string
  branchName: string
  total: number
}

interface RecentRepair {
  id: string
  job_number: string
  device: string
  issue: string
  status: string
  created_at: string | null
  customer_name: string
}

interface RecentActivity {
  id: string
  status: string
  note: string | null
  created_at: string | null
  repair_id: string | null
  job_number: string | null
  device: string
  changed_by: string | null
}

interface DashboardState {
  stats: DashboardStats | null
  branchRevenue: BranchRevenue[]
  recentRepairs: RecentRepair[]
  recentActivity: RecentActivity[]
  lastFetched: string | null
  setDashboardData: (data: {
    stats: DashboardStats | null
    branchRevenue: BranchRevenue[]
    recentRepairs: RecentRepair[]
    recentActivity: RecentActivity[]
  }) => void
  clearCache: () => void
}

export const useDashboardStore = create<DashboardState>()(
  persist(
    (set) => ({
      stats: null,
      branchRevenue: [],
      recentRepairs: [],
      recentActivity: [],
      lastFetched: null,
      setDashboardData: (data) => set({
        ...data,
        lastFetched: new Date().toISOString()
      }),
      clearCache: () => set({
        stats: null,
        branchRevenue: [],
        recentRepairs: [],
        recentActivity: [],
        lastFetched: null
      })
    }),
    {
      name: 'dashboard-storage'
    }
  )
)
