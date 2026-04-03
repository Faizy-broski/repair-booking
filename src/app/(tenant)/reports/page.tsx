'use client'
import { useState, useEffect, useCallback } from 'react'
import {
  Download, TrendingUp, TrendingDown, DollarSign, ShoppingCart, Wrench, AlertTriangle,
  Package, BarChart2, BookmarkCheck, Star, Trash2, RefreshCw, Lock,
} from 'lucide-react'
import * as Tabs from '@radix-ui/react-tabs'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Modal } from '@/components/ui/modal'
import { DataTable } from '@/components/shared/data-table'
import { useAuthStore } from '@/store/auth.store'
import { formatCurrency, formatDate } from '@/lib/utils'
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend,
  PieChart, Pie, Cell,
} from 'recharts'
import type { ColumnDef } from '@tanstack/react-table'

interface SalesRow { date: string; total_sales: number; transaction_count: number; avg_order_value: number }
interface ProfitLossData { revenue: number; repair_revenue: number; total_revenue: number; cogs: number; expenses: number; salaries: number; total_costs: number; gross_profit: number; net_profit: number }
interface RepairRow { status: string; count: number; total_value: number }
interface TaxRow { tax_class: string; total_tax: number }
interface PaymentRow { payment_method: string; total: number; count: number }
interface EmployeeRow { employee_id: string; employee_name: string; repairs_completed: number; repair_revenue: number; sales_count: number; sales_revenue: number; commission_total: number }
interface InventorySummaryRow { product_id: string; product_name: string; sku: string | null; category: string; quantity: number; cost_price: number; sale_price: number; stock_value: number; retail_value: number }
interface PartConsumptionRow { product_id: string; product_name: string; sku: string | null; quantity: number; total_cost: number }
interface AdjustmentRow { id: string; product_id: string; quantity_change: number; reason: string | null; reference_type: string | null; created_at: string; products: { name: string; sku: string | null } | null }
interface LowStockRow { id: string; product_id: string; quantity: number; low_stock_alert: number; products?: { id: string; name: string; sku: string | null; image_url: string | null; cost_price: number } | null }
interface RegisterSession { id: string; cashier_id: string; opening_float: number; closing_cash: number | null; expected_cash: number | null; variance: number | null; total_sales: number | null; total_refunds: number | null; cash_sales: number | null; card_sales: number | null; other_sales: number | null; transaction_count: number | null; opened_at: string; closed_at: string | null; status: string }
interface SavedReport { id: string; name: string; report_type: string; config: Record<string, unknown>; is_favorite: boolean; created_at: string }

const PAYMENT_COLORS = ['#3b82f6', '#22c55e', '#f59e0b', '#ec4899', '#8b5cf6', '#14b8a6']

function firstOfMonth() {
  const d = new Date(); d.setDate(1); return d.toISOString().split('T')[0]
}
function today() { return new Date().toISOString().split('T')[0] }

export default function ReportsPage() {
  const { activeBranch } = useAuthStore()
  const [activeTab, setActiveTab] = useState('sales')
  const [loading, setLoading] = useState(false)
  const [dateFrom, setDateFrom] = useState(firstOfMonth)
  const [dateTo, setDateTo] = useState(today)
  const [summaryStats, setSummaryStats] = useState({ total_revenue: 0, total_transactions: 0, total_repairs: 0, net_profit: 0 })
  const [salesData, setSalesData] = useState<SalesRow[]>([])
  const [plData, setPlData] = useState<ProfitLossData | null>(null)
  const [repairData, setRepairData] = useState<RepairRow[]>([])
  const [taxData, setTaxData] = useState<{ rows: TaxRow[]; grand_total: number } | null>(null)
  const [paymentData, setPaymentData] = useState<PaymentRow[]>([])
  const [employeeData, setEmployeeData] = useState<EmployeeRow[]>([])
  const [invSubTab, setInvSubTab] = useState<'summary' | 'parts_consumption' | 'adjustments' | 'low_stock'>('summary')
  const [inventoryData, setInventoryData] = useState<{ low_stock_count: number; low_stock_items: LowStockRow[]; total_items: number; total_value: number } | null>(null)
  const [invSummary, setInvSummary] = useState<InventorySummaryRow[]>([])
  const [partConsumption, setPartConsumption] = useState<PartConsumptionRow[]>([])
  const [adjustmentData, setAdjustmentData] = useState<AdjustmentRow[]>([])
  const [sessions, setSessions] = useState<RegisterSession[]>([])
  const [currentSession, setCurrentSession] = useState<RegisterSession | null>(null)
  const [openModal, setOpenModal] = useState(false)
  const [closeModal, setCloseModal] = useState(false)
  const [openingFloat, setOpeningFloat] = useState('')
  const [closingCash, setClosingCash] = useState('')
  const [zReportData, setZReportData] = useState<Record<string, unknown> | null>(null)
  const [sessionLoading, setSessionLoading] = useState(false)
  const [selectedItems, setSelectedItems] = useState<Set<string>>(new Set())
  const [poModal, setPoModal] = useState(false)
  const [suppliers, setSuppliers] = useState<Array<{ id: string; name: string }>>([])
  const [poSupplierId, setPoSupplierId] = useState('')
  const [creatingPo, setCreatingPo] = useState(false)
  const [savedReports, setSavedReports] = useState<SavedReport[]>([])
  const [savedModal, setSavedModal] = useState(false)
  const [newReportName, setNewReportName] = useState('')
  const [newReportType, setNewReportType] = useState<SavedReport['report_type']>('custom')

  const fetchReport = useCallback(async (type: string) => {
    if (!activeBranch) return
    setLoading(true)
    try {
      const params = new URLSearchParams({ type, branch_id: activeBranch.id, from: `${dateFrom}T00:00:00`, to: `${dateTo}T23:59:59` })
      const res = await fetch(`/api/reports?${params}`)
      const json = await res.json()
      if (type === 'sales') {
        const grouped: Record<string, { total: number; count: number }> = {}
        for (const s of json.data ?? []) {
          const d = s.created_at?.split('T')[0] ?? ''
          if (!grouped[d]) grouped[d] = { total: 0, count: 0 }
          grouped[d].total += s.total ?? 0
          grouped[d].count += 1
        }
        setSalesData(Object.entries(grouped).map(([date, { total, count }]) => ({
          date, total_sales: total, transaction_count: count, avg_order_value: count ? total / count : 0,
        })))
      }
      if (type === 'profit_loss') setPlData(json.data ?? null)
      if (type === 'repairs') {
        const grouped: Record<string, { count: number; value: number }> = {}
        for (const r of json.data ?? []) {
          grouped[r.status] = grouped[r.status] ?? { count: 0, value: 0 }
          grouped[r.status].count += 1
          grouped[r.status].value += r.actual_cost ?? 0
        }
        setRepairData(Object.entries(grouped).map(([status, { count, value }]) => ({ status, count, total_value: value })))
      }
      if (type === 'tax') setTaxData(json.data ?? null)
      if (type === 'payment_methods') setPaymentData(json.data ?? [])
      if (type === 'dashboard') {
        const d = json.data ?? {}
        // Default response returns { sales: [], repairs: [], profitLoss: {} }
        const salesArr: Array<{ total?: number }> = d.sales ?? []
        const repairsArr: unknown[] = d.repairs ?? []
        const pl: Partial<ProfitLossData> = d.profitLoss ?? {}
        setSummaryStats({
          total_revenue: pl.total_revenue ?? salesArr.reduce((s, r) => s + (r.total ?? 0), 0),
          total_transactions: salesArr.length,
          total_repairs: repairsArr.length,
          net_profit: pl.net_profit ?? 0,
        })
      }
      if (type === 'sessions') setSessions(json.data ?? [])
    } finally { setLoading(false) }
  }, [activeBranch, dateFrom, dateTo])

  const fetchEmployeeReport = useCallback(async () => {
    if (!activeBranch) return
    setLoading(true)
    try {
      const params = new URLSearchParams({ branch_id: activeBranch.id, from: `${dateFrom}T00:00:00`, to: `${dateTo}T23:59:59`, subtype: 'productivity' })
      const res = await fetch(`/api/reports/employees?${params}`)
      const json = await res.json()
      setEmployeeData(json.data ?? [])
    } finally { setLoading(false) }
  }, [activeBranch, dateFrom, dateTo])

  const fetchInventoryDetail = useCallback(async (subtype: string) => {
    if (!activeBranch) return
    setLoading(true)
    try {
      const params = new URLSearchParams({ branch_id: activeBranch.id, from: `${dateFrom}T00:00:00`, to: `${dateTo}T23:59:59`, subtype })
      const res = await fetch(`/api/reports/inventory-detail?${params}`)
      const json = await res.json()
      if (subtype === 'summary') setInvSummary(json.data ?? [])
      if (subtype === 'parts_consumption') setPartConsumption(json.data ?? [])
      if (subtype === 'adjustments') setAdjustmentData(json.data ?? [])
    } finally { setLoading(false) }
  }, [activeBranch, dateFrom, dateTo])

  const fetchCurrentSession = useCallback(async () => {
    if (!activeBranch) return
    const res = await fetch(`/api/pos/session?branch_id=${activeBranch.id}`)
    const json = await res.json()
    setCurrentSession(json.data)
  }, [activeBranch])

  const fetchSavedReports = useCallback(async () => {
    const res = await fetch('/api/reports/saved')
    const json = await res.json()
    setSavedReports(json.data ?? [])
  }, [])

  useEffect(() => {
    fetchReport('dashboard')
    fetchCurrentSession()
    fetchSavedReports()
  }, [activeBranch]) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (activeTab === 'sales') fetchReport('sales')
    else if (activeTab === 'profit_loss') fetchReport('profit_loss')
    else if (activeTab === 'repairs') fetchReport('repairs')
    else if (activeTab === 'tax') fetchReport('tax')
    else if (activeTab === 'payment_methods') fetchReport('payment_methods')
    else if (activeTab === 'employees') fetchEmployeeReport()
    else if (activeTab === 'inventory') { fetchReport('inventory'); fetchInventoryDetail('summary') }
    else if (activeTab === 'z_report') fetchReport('sessions')
  }, [activeTab, dateFrom, dateTo]) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (activeTab === 'inventory') fetchInventoryDetail(invSubTab)
  }, [invSubTab]) // eslint-disable-line react-hooks/exhaustive-deps

  const salesColumns: ColumnDef<SalesRow>[] = [
    { accessorKey: 'date', header: 'Date', cell: ({ getValue }) => formatDate(getValue() as string) },
    { accessorKey: 'transaction_count', header: 'Transactions' },
    { accessorKey: 'total_sales', header: 'Revenue', cell: ({ getValue }) => formatCurrency(getValue() as number) },
    { accessorKey: 'avg_order_value', header: 'Avg. Order', cell: ({ getValue }) => formatCurrency(getValue() as number) },
  ]

  const repairColumns: ColumnDef<RepairRow>[] = [
    { accessorKey: 'status', header: 'Status', cell: ({ getValue }) => <span className="capitalize">{(getValue() as string).replace('_', ' ')}</span> },
    { accessorKey: 'count', header: 'Count' },
    { accessorKey: 'total_value', header: 'Total Value', cell: ({ getValue }) => formatCurrency(getValue() as number) },
  ]

  const taxColumns: ColumnDef<TaxRow>[] = [
    { accessorKey: 'tax_class', header: 'Tax Class' },
    { accessorKey: 'total_tax', header: 'Tax Collected', cell: ({ getValue }) => formatCurrency(getValue() as number) },
  ]

  const paymentColumns: ColumnDef<PaymentRow>[] = [
    { accessorKey: 'payment_method', header: 'Method', cell: ({ getValue }) => <span className="capitalize">{(getValue() as string).replace('_', ' ')}</span> },
    { accessorKey: 'count', header: 'Transactions' },
    { accessorKey: 'total', header: 'Revenue', cell: ({ getValue }) => formatCurrency(getValue() as number) },
  ]

  const employeeColumns: ColumnDef<EmployeeRow>[] = [
    { accessorKey: 'employee_name', header: 'Employee' },
    { accessorKey: 'repairs_completed', header: 'Repairs' },
    { accessorKey: 'repair_revenue', header: 'Repair Rev.', cell: ({ getValue }) => formatCurrency(getValue() as number) },
    { accessorKey: 'sales_count', header: 'Sales' },
    { accessorKey: 'sales_revenue', header: 'Sales Rev.', cell: ({ getValue }) => formatCurrency(getValue() as number) },
    { accessorKey: 'commission_total', header: 'Commission', cell: ({ getValue }) => formatCurrency(getValue() as number) },
  ]

  const invSummaryColumns: ColumnDef<InventorySummaryRow>[] = [
    { accessorKey: 'product_name', header: 'Product' },
    { accessorKey: 'sku', header: 'SKU', cell: ({ getValue }) => (getValue() as string) ?? '—' },
    { accessorKey: 'category', header: 'Category' },
    { accessorKey: 'quantity', header: 'Qty' },
    { accessorKey: 'cost_price', header: 'Cost', cell: ({ getValue }) => formatCurrency(getValue() as number) },
    { accessorKey: 'stock_value', header: 'Stock Value', cell: ({ getValue }) => formatCurrency(getValue() as number) },
    { accessorKey: 'retail_value', header: 'Retail Value', cell: ({ getValue }) => formatCurrency(getValue() as number) },
  ]

  const partColumns: ColumnDef<PartConsumptionRow>[] = [
    { accessorKey: 'product_name', header: 'Part' },
    { accessorKey: 'sku', header: 'SKU', cell: ({ getValue }) => (getValue() as string) ?? '—' },
    { accessorKey: 'quantity', header: 'Qty Used' },
    { accessorKey: 'total_cost', header: 'Total Cost', cell: ({ getValue }) => formatCurrency(getValue() as number) },
  ]

  const adjustmentColumns: ColumnDef<AdjustmentRow>[] = [
    { accessorKey: 'created_at', header: 'Date', cell: ({ getValue }) => formatDate(getValue() as string) },
    { id: 'product', header: 'Product', cell: ({ row }) => row.original.products?.name ?? row.original.product_id },
    { accessorKey: 'quantity_change', header: 'Change', cell: ({ getValue }) => { const v = getValue() as number; return <span className={v > 0 ? 'text-green-600 font-medium' : 'text-red-600 font-medium'}>{v > 0 ? `+${v}` : v}</span> } },
    { accessorKey: 'reason', header: 'Reason', cell: ({ getValue }) => (getValue() as string) ?? '—' },
    { accessorKey: 'reference_type', header: 'Type', cell: ({ getValue }) => (getValue() as string) ?? '—' },
  ]

  const statsCards = [
    { label: 'Total Revenue', value: formatCurrency(summaryStats.total_revenue), icon: DollarSign, color: 'text-green-600', bg: 'bg-green-50' },
    { label: 'Transactions', value: String(summaryStats.total_transactions), icon: ShoppingCart, color: 'text-blue-600', bg: 'bg-blue-50' },
    { label: 'Repairs', value: String(summaryStats.total_repairs), icon: Wrench, color: 'text-purple-600', bg: 'bg-purple-50' },
    { label: 'Net Profit', value: formatCurrency(summaryStats.net_profit), icon: summaryStats.net_profit >= 0 ? TrendingUp : TrendingDown, color: summaryStats.net_profit >= 0 ? 'text-green-600' : 'text-red-600', bg: summaryStats.net_profit >= 0 ? 'bg-green-50' : 'bg-red-50' },
  ]

  function exportCsv<T extends Record<string, unknown>>(rows: T[], filename: string) {
    if (!rows.length) return
    const headers = Object.keys(rows[0])
    const csv = [headers.join(','), ...rows.map((r) => headers.map((h) => JSON.stringify(r[h] ?? '')).join(','))].join('\n')
    const blob = new Blob([csv], { type: 'text/csv' })
    const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = filename; a.click()
  }

  async function handleOpenSession() {
    setSessionLoading(true)
    const res = await fetch('/api/pos/session/open', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ opening_float: parseFloat(openingFloat) || 0, branch_id: activeBranch?.id }),
    })
    if (res.ok) { setOpenModal(false); setOpeningFloat(''); fetchCurrentSession() }
    setSessionLoading(false)
  }

  async function handleCloseSession() {
    if (!currentSession) return
    setSessionLoading(true)
    const res = await fetch('/api/pos/session/close', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ session_id: currentSession.id, closing_cash: parseFloat(closingCash) || 0 }),
    })
    if (res.ok) {
      const json = await res.json()
      setZReportData(json.data)
      setCloseModal(false); setClosingCash(''); setCurrentSession(null)
      fetchReport('sessions')
    }
    setSessionLoading(false)
  }

  async function saveReport() {
    if (!newReportName.trim()) return
    const res = await fetch('/api/reports/saved', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: newReportName, report_type: newReportType, config: { tab: activeTab, from: dateFrom, to: dateTo } }),
    })
    if (res.ok) { setSavedModal(false); setNewReportName(''); fetchSavedReports() }
  }

  async function toggleFavorite(r: SavedReport) {
    await fetch(`/api/reports/saved/${r.id}`, {
      method: 'PUT', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ is_favorite: !r.is_favorite }),
    })
    fetchSavedReports()
  }

  const tabs = [
    { value: 'sales', label: 'Sales' },
    { value: 'profit_loss', label: 'P&L' },
    { value: 'repairs', label: 'Repairs' },
    { value: 'tax', label: 'Tax' },
    { value: 'payment_methods', label: 'Payments' },
    { value: 'employees', label: 'Employees' },
    { value: 'inventory', label: 'Inventory' },
    { value: 'z_report', label: 'Z-Report' },
    { value: 'saved', label: 'Saved' },
  ]

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-gray-900">Reports</h1>
          <p className="text-sm text-gray-500">Business performance analytics</p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={() => setSavedModal(true)}>
            <BookmarkCheck className="h-4 w-4" /> Save view
          </Button>
          <Button variant="outline" size="sm" onClick={() => exportCsv(salesData as unknown as Record<string, unknown>[], `sales-${dateFrom}-${dateTo}.csv`)}>
            <Download className="h-4 w-4" /> Export CSV
          </Button>
        </div>
      </div>

      {/* Register session ribbon */}
      {currentSession ? (
        <div className="flex items-center justify-between rounded-xl border border-amber-200 bg-amber-50 px-4 py-2.5">
          <div className="flex items-center gap-2">
            <Lock className="h-4 w-4 text-amber-600" />
            <span className="text-sm font-medium text-amber-800">Register open since {formatDate(currentSession.opened_at)} — Float: {formatCurrency(currentSession.opening_float)}</span>
          </div>
          <Button size="sm" variant="outline" onClick={() => setCloseModal(true)}>Close Register (Z-Report)</Button>
        </div>
      ) : (
        <div className="flex items-center justify-between rounded-xl border border-gray-200 bg-white px-4 py-2.5">
          <span className="text-sm text-gray-500">No register session open</span>
          <Button size="sm" onClick={() => setOpenModal(true)}>Open Register</Button>
        </div>
      )}

      {/* Date range */}
      <div className="flex items-center gap-3 rounded-xl border border-gray-200 bg-white px-4 py-3">
        <label className="text-sm font-medium text-gray-600">From</label>
        <input type="date" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)} className="h-8 rounded-md border border-gray-300 px-2 text-sm" />
        <label className="text-sm font-medium text-gray-600">To</label>
        <input type="date" value={dateTo} onChange={(e) => setDateTo(e.target.value)} className="h-8 rounded-md border border-gray-300 px-2 text-sm" />
        <Button size="sm" onClick={() => { fetchReport('dashboard'); fetchReport(activeTab) }}>
          <RefreshCw className="h-3.5 w-3.5" /> Apply
        </Button>
      </div>

      {/* Summary stats */}
      <div className="grid grid-cols-4 gap-4">
        {statsCards.map((card) => (
          <div key={card.label} className="rounded-xl border border-gray-200 bg-white p-4">
            <div className="flex items-center justify-between">
              <p className="text-sm text-gray-500">{card.label}</p>
              <div className={`rounded-lg p-2 ${card.bg}`}><card.icon className={`h-4 w-4 ${card.color}`} /></div>
            </div>
            <p className={`mt-2 text-2xl font-bold ${card.color}`}>{card.value}</p>
          </div>
        ))}
      </div>

      {/* Z-Report result banner */}
      {zReportData && (
        <div className="rounded-xl border border-blue-200 bg-blue-50 p-4">
          <div className="flex items-center justify-between mb-3">
            <h3 className="font-semibold text-blue-900">Z-Report — Register Closed</h3>
            <Button size="sm" variant="outline" onClick={() => setZReportData(null)}>Dismiss</Button>
          </div>
          <div className="grid grid-cols-3 gap-3 text-sm">
            {([
              { label: 'Opening Float', key: 'opening_float' },
              { label: 'Total Sales', key: 'total_sales' },
              { label: 'Total Refunds', key: 'total_refunds' },
              { label: 'Cash Sales', key: 'cash_sales' },
              { label: 'Card Sales', key: 'card_sales' },
              { label: 'Transactions', key: 'transaction_count', isCurrency: false },
              { label: 'Expected Cash', key: 'expected_cash' },
              { label: 'Closing Cash', key: 'closing_cash' },
              { label: 'Variance', key: 'variance', highlight: true },
            ] as { label: string; key: string; isCurrency?: boolean; highlight?: boolean }[]).map(({ label, key, isCurrency = true, highlight }) => (
              <div key={label} className={`rounded-lg border bg-white p-3 ${highlight && (zReportData[key] as number) !== 0 ? 'border-red-300' : 'border-gray-200'}`}>
                <p className="text-xs text-gray-500">{label}</p>
                <p className={`mt-0.5 font-semibold ${highlight && (zReportData[key] as number) !== 0 ? 'text-red-600' : 'text-gray-900'}`}>
                  {isCurrency ? formatCurrency(zReportData[key] as number) : String(zReportData[key])}
                </p>
              </div>
            ))}
          </div>
        </div>
      )}

      <Tabs.Root value={activeTab} onValueChange={setActiveTab}>
        <Tabs.List className="flex gap-1 rounded-lg bg-gray-100 p-1 overflow-x-auto">
          {tabs.map((tab) => (
            <Tabs.Trigger key={tab.value} value={tab.value}
              className="whitespace-nowrap rounded-md px-4 py-1.5 text-sm font-medium data-[state=active]:bg-white data-[state=active]:shadow-sm">
              {tab.label}
            </Tabs.Trigger>
          ))}
        </Tabs.List>

        {/* Sales */}
        <Tabs.Content value="sales" className="mt-4 space-y-4">
          {salesData.length > 0 && (
            <div className="rounded-xl border border-gray-200 bg-white p-4">
              <h3 className="mb-3 text-sm font-medium text-gray-700">Daily Revenue</h3>
              <ResponsiveContainer width="100%" height={240}>
                <BarChart data={salesData}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                  <XAxis dataKey="date" tick={{ fontSize: 11 }} tickFormatter={(v) => formatDate(v)} />
                  <YAxis tick={{ fontSize: 11 }} tickFormatter={(v) => `£${v}`} />
                  <Tooltip formatter={(v: unknown) => formatCurrency(v as number)} />
                  <Bar dataKey="total_sales" fill="#3b82f6" radius={[4, 4, 0, 0]} name="Revenue" />
                </BarChart>
              </ResponsiveContainer>
            </div>
          )}
          <DataTable data={salesData} columns={salesColumns} isLoading={loading} emptyMessage="No sales data for this period." />
        </Tabs.Content>

        {/* P&L */}
        <Tabs.Content value="profit_loss" className="mt-4 space-y-4">
          {plData ? (
            <>
              <div className="grid grid-cols-3 gap-4">
                {[
                  { label: 'Total Revenue', value: plData.total_revenue, color: 'text-blue-600', bg: 'bg-blue-50' },
                  { label: 'Total Costs', value: plData.total_costs, color: 'text-red-600', bg: 'bg-red-50' },
                  { label: 'Net Profit', value: plData.net_profit, color: plData.net_profit >= 0 ? 'text-green-600' : 'text-red-600', bg: plData.net_profit >= 0 ? 'bg-green-50' : 'bg-red-50' },
                ].map(({ label, value, color, bg }) => (
                  <div key={label} className="rounded-xl border border-gray-200 bg-white p-4">
                    <p className="text-sm text-gray-500">{label}</p>
                    <p className={`mt-1 text-2xl font-bold ${color}`}>{formatCurrency(value)}</p>
                  </div>
                ))}
              </div>
              <div className="rounded-xl border border-gray-200 bg-white p-4">
                <h3 className="mb-4 text-sm font-medium text-gray-700">Breakdown</h3>
                <div className="space-y-2 text-sm">
                  {([
                    { label: 'Sales Revenue', value: plData.revenue },
                    { label: 'Repair Revenue', value: plData.repair_revenue },
                    { label: '— COGS', value: -plData.cogs },
                    { label: 'Gross Profit', value: plData.gross_profit, bold: true },
                    { label: '— Operating Expenses', value: -plData.expenses },
                    { label: '— Salaries', value: -plData.salaries },
                    { label: 'Net Profit', value: plData.net_profit, bold: true },
                  ] as { label: string; value: number; bold?: boolean }[]).map(({ label, value, bold }) => (
                    <div key={label} className={`flex justify-between py-1.5 ${bold ? 'border-t border-gray-200 font-semibold' : ''}`}>
                      <span className={bold ? 'text-gray-900' : 'text-gray-600'}>{label}</span>
                      <span className={value < 0 ? 'text-red-600' : value > 0 ? 'text-green-700' : 'text-gray-500'}>{formatCurrency(Math.abs(value))}</span>
                    </div>
                  ))}
                </div>
              </div>
            </>
          ) : (
            <div className="flex h-32 items-center justify-center rounded-xl border border-gray-200 bg-white text-sm text-gray-400">No profit/loss data for this period.</div>
          )}
        </Tabs.Content>

        {/* Repairs */}
        <Tabs.Content value="repairs" className="mt-4">
          <DataTable data={repairData} columns={repairColumns} isLoading={loading} emptyMessage="No repair data for this period." />
        </Tabs.Content>

        {/* Tax */}
        <Tabs.Content value="tax" className="mt-4 space-y-4">
          {taxData ? (
            <div className="rounded-xl border border-gray-200 bg-white p-4">
              <div className="flex items-center justify-between mb-3">
                <h3 className="text-sm font-medium text-gray-700">Tax Collected by Class</h3>
                <Button size="sm" variant="outline" onClick={() => exportCsv(taxData.rows as unknown as Record<string, unknown>[], `tax-${dateFrom}-${dateTo}.csv`)}>
                  <Download className="h-3.5 w-3.5" /> Export
                </Button>
              </div>
              <DataTable data={taxData.rows} columns={taxColumns} isLoading={loading} emptyMessage="No tax data." />
              <div className="mt-3 flex justify-end border-t pt-3">
                <span className="text-sm font-semibold text-gray-700">Grand Total: {formatCurrency(taxData.grand_total)}</span>
              </div>
            </div>
          ) : (
            <div className="flex h-32 items-center justify-center rounded-xl border border-gray-200 bg-white text-sm text-gray-400">No tax data for this period.</div>
          )}
        </Tabs.Content>

        {/* Payment Methods */}
        <Tabs.Content value="payment_methods" className="mt-4 space-y-4">
          {paymentData.length > 0 && (
            <div className="grid grid-cols-2 gap-4">
              <div className="rounded-xl border border-gray-200 bg-white p-4">
                <h3 className="mb-3 text-sm font-medium text-gray-700">Revenue Split</h3>
                <ResponsiveContainer width="100%" height={220}>
                  <PieChart>
                    <Pie data={paymentData} dataKey="total" nameKey="payment_method" cx="50%" cy="50%" outerRadius={80}
                      label={({ payment_method, percent }) => `${payment_method} ${((percent ?? 0) * 100).toFixed(0)}%`}>
                      {paymentData.map((_, i) => <Cell key={i} fill={PAYMENT_COLORS[i % PAYMENT_COLORS.length]} />)}
                    </Pie>
                    <Tooltip formatter={(v: unknown) => formatCurrency(v as number)} />
                  </PieChart>
                </ResponsiveContainer>
              </div>
              <div className="rounded-xl border border-gray-200 bg-white p-4">
                <h3 className="mb-3 text-sm font-medium text-gray-700">Transaction Count</h3>
                <ResponsiveContainer width="100%" height={220}>
                  <BarChart data={paymentData} layout="vertical">
                    <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                    <XAxis type="number" tick={{ fontSize: 11 }} />
                    <YAxis dataKey="payment_method" type="category" tick={{ fontSize: 11 }} width={80} />
                    <Tooltip />
                    <Bar dataKey="count" fill="#8b5cf6" radius={[0, 4, 4, 0]} name="Transactions" />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </div>
          )}
          <DataTable data={paymentData} columns={paymentColumns} isLoading={loading} emptyMessage="No payment data for this period." />
        </Tabs.Content>

        {/* Employees */}
        <Tabs.Content value="employees" className="mt-4 space-y-4">
          <div className="flex justify-end">
            <Button size="sm" variant="outline" onClick={() => exportCsv(employeeData as unknown as Record<string, unknown>[], `employees-${dateFrom}-${dateTo}.csv`)}>
              <Download className="h-3.5 w-3.5" /> Export
            </Button>
          </div>
          {employeeData.length > 0 && (
            <div className="rounded-xl border border-gray-200 bg-white p-4">
              <h3 className="mb-3 text-sm font-medium text-gray-700">Revenue by Employee</h3>
              <ResponsiveContainer width="100%" height={240}>
                <BarChart data={employeeData}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                  <XAxis dataKey="employee_name" tick={{ fontSize: 11 }} />
                  <YAxis tick={{ fontSize: 11 }} tickFormatter={(v) => `£${v}`} />
                  <Tooltip formatter={(v: unknown) => formatCurrency(v as number)} />
                  <Legend />
                  <Bar dataKey="sales_revenue" name="Sales" fill="#3b82f6" stackId="a" />
                  <Bar dataKey="repair_revenue" name="Repairs" fill="#8b5cf6" stackId="a" />
                </BarChart>
              </ResponsiveContainer>
            </div>
          )}
          <DataTable data={employeeData} columns={employeeColumns} isLoading={loading} emptyMessage="No employee data for this period." />
        </Tabs.Content>

        {/* Inventory */}
        <Tabs.Content value="inventory" className="mt-4 space-y-4">
          <div className="flex gap-1 rounded-lg bg-gray-100 p-1 w-fit">
            {([
              { value: 'summary', label: 'Summary' },
              { value: 'low_stock', label: 'Low Stock' },
              { value: 'parts_consumption', label: 'Part Usage' },
              { value: 'adjustments', label: 'Adjustments' },
            ] as { value: typeof invSubTab; label: string }[]).map((t) => (
              <button key={t.value} onClick={() => setInvSubTab(t.value)}
                className={`rounded-md px-4 py-1.5 text-sm font-medium transition-colors ${invSubTab === t.value ? 'bg-white shadow-sm text-gray-900' : 'text-gray-600 hover:text-gray-900'}`}>
                {t.label}
              </button>
            ))}
          </div>

          {invSubTab === 'summary' && (
            <>
              {inventoryData && (
                <div className="grid grid-cols-3 gap-4">
                  <div className="rounded-xl border bg-white p-4"><p className="text-sm text-gray-500">Low Stock</p><p className="mt-1 text-2xl font-bold text-orange-600">{inventoryData.low_stock_count}</p></div>
                  <div className="rounded-xl border bg-white p-4"><p className="text-sm text-gray-500">Total Units</p><p className="mt-1 text-2xl font-bold">{inventoryData.total_items}</p></div>
                  <div className="rounded-xl border bg-white p-4"><p className="text-sm text-gray-500">Stock Value</p><p className="mt-1 text-2xl font-bold">{formatCurrency(inventoryData.total_value)}</p></div>
                </div>
              )}
              <DataTable data={invSummary} columns={invSummaryColumns} isLoading={loading} emptyMessage="No inventory data." />
            </>
          )}

          {invSubTab === 'low_stock' && inventoryData && (
            <div className="rounded-xl border border-gray-200 bg-white overflow-hidden">
              <div className="flex items-center justify-between border-b border-gray-200 px-4 py-3">
                <div className="flex items-center gap-2">
                  <AlertTriangle className="h-4 w-4 text-orange-500" />
                  <h3 className="font-semibold text-gray-900 text-sm">Low Stock ({inventoryData.low_stock_count})</h3>
                </div>
                {selectedItems.size > 0 && (
                  <Button size="sm" onClick={async () => {
                    const res = await fetch('/api/suppliers'); const json = await res.json()
                    setSuppliers(json.data ?? []); setPoModal(true)
                  }}>
                    <Package className="h-4 w-4" /> Push to PO ({selectedItems.size})
                  </Button>
                )}
              </div>
              <table className="w-full text-sm">
                <thead className="bg-gray-50 text-xs text-gray-500">
                  <tr>
                    <th className="px-4 py-2 text-left w-10">
                      <input type="checkbox" checked={selectedItems.size === inventoryData.low_stock_items.length && inventoryData.low_stock_items.length > 0}
                        onChange={(e) => setSelectedItems(e.target.checked ? new Set(inventoryData.low_stock_items.map((i) => i.product_id)) : new Set())} className="rounded" />
                    </th>
                    <th className="px-4 py-2 text-left">Product</th>
                    <th className="px-4 py-2 text-right">On Hand</th>
                    <th className="px-4 py-2 text-right">Alert</th>
                    <th className="px-4 py-2 text-right">Shortfall</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {inventoryData.low_stock_items.map((item) => (
                    <tr key={item.id} className="hover:bg-gray-50">
                      <td className="px-4 py-3">
                        <input type="checkbox" checked={selectedItems.has(item.product_id)}
                          onChange={(e) => { setSelectedItems((prev) => { const n = new Set(prev); e.target.checked ? n.add(item.product_id) : n.delete(item.product_id); return n }) }} className="rounded" />
                      </td>
                      <td className="px-4 py-3"><p className="font-medium">{item.products?.name}</p>{item.products?.sku && <p className="text-xs text-gray-400">SKU: {item.products.sku}</p>}</td>
                      <td className="px-4 py-3 text-right"><Badge variant={item.quantity === 0 ? 'destructive' : 'warning'}>{item.quantity}</Badge></td>
                      <td className="px-4 py-3 text-right text-gray-600">{item.low_stock_alert ?? 5}</td>
                      <td className="px-4 py-3 text-right font-medium text-red-600">{Math.max(0, (item.low_stock_alert ?? 5) - item.quantity)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {invSubTab === 'parts_consumption' && (
            <DataTable data={partConsumption} columns={partColumns} isLoading={loading} emptyMessage="No part consumption data for this period." />
          )}

          {invSubTab === 'adjustments' && (
            <DataTable data={adjustmentData} columns={adjustmentColumns} isLoading={loading} emptyMessage="No inventory adjustments for this period." />
          )}
        </Tabs.Content>

        {/* Z-Report */}
        <Tabs.Content value="z_report" className="mt-4 space-y-4">
          <div className="rounded-xl border border-gray-200 bg-white overflow-hidden">
            <div className="border-b border-gray-200 px-4 py-3">
              <h3 className="font-semibold text-gray-900 text-sm">Register Sessions</h3>
            </div>
            <table className="w-full text-sm">
              <thead className="bg-gray-50 text-xs text-gray-500">
                <tr>
                  <th className="px-4 py-2 text-left">Opened</th>
                  <th className="px-4 py-2 text-left">Closed</th>
                  <th className="px-4 py-2 text-right">Float</th>
                  <th className="px-4 py-2 text-right">Total Sales</th>
                  <th className="px-4 py-2 text-right">Cash</th>
                  <th className="px-4 py-2 text-right">Card</th>
                  <th className="px-4 py-2 text-right">Variance</th>
                  <th className="px-4 py-2 text-center">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {sessions.length === 0 && (
                  <tr><td colSpan={8} className="px-4 py-8 text-center text-gray-400">No register sessions in this period.</td></tr>
                )}
                {sessions.map((s) => (
                  <tr key={s.id} className="hover:bg-gray-50">
                    <td className="px-4 py-3">{formatDate(s.opened_at)}</td>
                    <td className="px-4 py-3">{s.closed_at ? formatDate(s.closed_at) : '—'}</td>
                    <td className="px-4 py-3 text-right">{formatCurrency(s.opening_float)}</td>
                    <td className="px-4 py-3 text-right">{s.total_sales != null ? formatCurrency(s.total_sales) : '—'}</td>
                    <td className="px-4 py-3 text-right">{s.cash_sales != null ? formatCurrency(s.cash_sales) : '—'}</td>
                    <td className="px-4 py-3 text-right">{s.card_sales != null ? formatCurrency(s.card_sales) : '—'}</td>
                    <td className={`px-4 py-3 text-right font-medium ${(s.variance ?? 0) !== 0 ? 'text-red-600' : 'text-green-600'}`}>
                      {s.variance != null ? formatCurrency(s.variance) : '—'}
                    </td>
                    <td className="px-4 py-3 text-center">
                      <Badge variant={s.status === 'open' ? 'warning' : 'default'}>{s.status}</Badge>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Tabs.Content>

        {/* Saved Reports */}
        <Tabs.Content value="saved" className="mt-4 space-y-3">
          {savedReports.length === 0 && (
            <div className="flex h-32 items-center justify-center rounded-xl border border-dashed border-gray-300 text-sm text-gray-400">
              No saved reports yet. Use &quot;Save view&quot; to bookmark a report configuration.
            </div>
          )}
          {savedReports.map((r) => (
            <div key={r.id} className="flex items-center justify-between rounded-xl border border-gray-200 bg-white px-4 py-3">
              <div className="flex items-center gap-3">
                <BarChart2 className="h-4 w-4 text-gray-400" />
                <div>
                  <p className="font-medium text-gray-900">{r.name}</p>
                  <p className="text-xs text-gray-400 capitalize">{r.report_type} · {formatDate(r.created_at)}</p>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <button onClick={() => toggleFavorite(r)} className={`p-1.5 rounded-md ${r.is_favorite ? 'text-yellow-500' : 'text-gray-300 hover:text-gray-500'}`}>
                  <Star className="h-4 w-4" fill={r.is_favorite ? 'currentColor' : 'none'} />
                </button>
                <Button size="sm" variant="outline" onClick={() => {
                  const cfg = r.config as Record<string, string>
                  if (cfg.tab) setActiveTab(cfg.tab)
                  if (cfg.from) setDateFrom(cfg.from)
                  if (cfg.to) setDateTo(cfg.to)
                }}>Load</Button>
                <button onClick={async () => { await fetch(`/api/reports/saved/${r.id}`, { method: 'DELETE' }); fetchSavedReports() }}
                  className="p-1.5 text-red-400 hover:text-red-600 rounded-md">
                  <Trash2 className="h-4 w-4" />
                </button>
              </div>
            </div>
          ))}
        </Tabs.Content>
      </Tabs.Root>

      {/* Open Register Modal */}
      <Modal open={openModal} onClose={() => setOpenModal(false)} title="Open Register" size="sm">
        <div className="space-y-4">
          <div>
            <label className="mb-1 block text-sm font-medium text-gray-700">Opening Float (£)</label>
            <input type="number" min="0" step="0.01" value={openingFloat} onChange={(e) => setOpeningFloat(e.target.value)} placeholder="0.00" className="h-10 w-full rounded-lg border border-gray-300 px-3 text-sm" />
          </div>
          <Button className="w-full" loading={sessionLoading} onClick={handleOpenSession}>Open Register</Button>
        </div>
      </Modal>

      {/* Close Register Modal */}
      <Modal open={closeModal} onClose={() => setCloseModal(false)} title="Close Register — Z-Report" size="sm">
        <div className="space-y-4">
          <div className="rounded-lg bg-gray-50 p-3 text-sm">
            <p className="text-gray-600">Opening float: <strong>{formatCurrency(currentSession?.opening_float ?? 0)}</strong></p>
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium text-gray-700">Cash in Drawer (£)</label>
            <input type="number" min="0" step="0.01" value={closingCash} onChange={(e) => setClosingCash(e.target.value)} placeholder="0.00" className="h-10 w-full rounded-lg border border-gray-300 px-3 text-sm" />
          </div>
          <Button className="w-full" loading={sessionLoading} onClick={handleCloseSession}>Generate Z-Report & Close</Button>
        </div>
      </Modal>

      {/* Push to PO Modal */}
      <Modal open={poModal} onClose={() => setPoModal(false)} title="Push to Purchase Order" size="sm">
        <div className="space-y-3">
          <p className="text-sm text-gray-600">{selectedItems.size} items selected.</p>
          <div>
            <label className="mb-1 block text-sm font-medium text-gray-700">Supplier *</label>
            <select value={poSupplierId} onChange={(e) => setPoSupplierId(e.target.value)} className="h-9 w-full rounded-lg border border-gray-300 px-3 text-sm">
              <option value="">Select supplier…</option>
              {suppliers.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
            </select>
          </div>
          <Button className="w-full" disabled={!poSupplierId} loading={creatingPo} onClick={async () => {
            if (!activeBranch || !poSupplierId) return
            setCreatingPo(true)
            const items = Array.from(selectedItems).map((productId) => {
              const inv = inventoryData?.low_stock_items.find((i) => i.product_id === productId)
              return { product_id: productId, quantity: Math.max(1, (inv?.low_stock_alert ?? 5) - (inv?.quantity ?? 0)) }
            })
            const res = await fetch(`/api/purchase-orders/from-low-stock?branch_id=${activeBranch.id}`, {
              method: 'POST', headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ supplier_id: poSupplierId, items }),
            })
            if (res.ok) { setPoModal(false); setSelectedItems(new Set()); setPoSupplierId('') }
            setCreatingPo(false)
          }}>Create Draft PO</Button>
        </div>
      </Modal>

      {/* Save Report Modal */}
      <Modal open={savedModal} onClose={() => setSavedModal(false)} title="Save Report View" size="sm">
        <div className="space-y-4">
          <div>
            <label className="mb-1 block text-sm font-medium text-gray-700">Report Name *</label>
            <input value={newReportName} onChange={(e) => setNewReportName(e.target.value)} placeholder="e.g. Monthly Sales Summary" className="h-10 w-full rounded-lg border border-gray-300 px-3 text-sm" />
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium text-gray-700">Type</label>
            <select value={newReportType} onChange={(e) => setNewReportType(e.target.value as SavedReport['report_type'])} className="h-9 w-full rounded-lg border border-gray-300 px-3 text-sm">
              {['sales', 'repairs', 'inventory', 'employees', 'custom'].map((t) => <option key={t} value={t}>{t}</option>)}
            </select>
          </div>
          <Button className="w-full" onClick={saveReport}>Save Report</Button>
        </div>
      </Modal>
    </div>
  )
}
