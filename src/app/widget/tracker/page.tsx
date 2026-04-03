'use client'
import { useState, useEffect } from 'react'
import { Search, Loader2, CheckCircle2, Clock, Wrench, Package, XCircle, AlertCircle } from 'lucide-react'

const STATUS_CONFIG: Record<string, { label: string; color: string; bg: string; icon: React.ReactNode }> = {
  received:      { label: 'Received',              color: 'text-blue-700',  bg: 'bg-blue-50',   icon: <Package className="h-5 w-5" /> },
  in_progress:   { label: 'In Progress',           color: 'text-yellow-700',bg: 'bg-yellow-50', icon: <Wrench className="h-5 w-5" /> },
  waiting_parts: { label: 'Waiting for Parts',     color: 'text-orange-700',bg: 'bg-orange-50', icon: <Clock className="h-5 w-5" /> },
  repaired:      { label: 'Ready for Collection',  color: 'text-green-700', bg: 'bg-green-50',  icon: <CheckCircle2 className="h-5 w-5" /> },
  collected:     { label: 'Collected',             color: 'text-gray-700',  bg: 'bg-gray-50',   icon: <CheckCircle2 className="h-5 w-5" /> },
  unrepairable:  { label: 'Unrepairable',          color: 'text-red-700',   bg: 'bg-red-50',    icon: <XCircle className="h-5 w-5" /> },
}

interface TicketResult {
  ticket_number: string
  status: string
  status_label: string
  device: string
  issue: string
  created_at: string
  updated_at: string
  store_name: string | null
}

export default function TrackerWidget() {
  const [subdomain, setSubdomain] = useState('')
  const [ticketNumber, setTicketNumber] = useState('')
  const [phone, setPhone] = useState('')
  const [loading, setLoading] = useState(false)
  const [result, setResult] = useState<TicketResult | null>(null)
  const [error, setError] = useState('')

  useEffect(() => {
    const params = new URLSearchParams(window.location.search)
    setSubdomain(params.get('subdomain') ?? '')
  }, [])

  async function handleSearch(e: React.FormEvent) {
    e.preventDefault()
    if (!ticketNumber.trim()) return
    setLoading(true)
    setError('')
    setResult(null)

    const params = new URLSearchParams({ ticket_number: ticketNumber.trim() })
    if (phone.trim()) params.set('phone', phone.trim())
    if (subdomain) params.set('subdomain', subdomain)

    const res = await fetch(`/api/public/ticket-status?${params}`)
    const json = await res.json()

    if (!res.ok) {
      setError(json.error ?? 'Ticket not found. Please check the number and try again.')
    } else {
      setResult(json.data)
    }
    setLoading(false)
  }

  const statusCfg = result ? (STATUS_CONFIG[result.status] ?? STATUS_CONFIG.received) : null

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 to-blue-50 flex items-center justify-center p-4">
      <div className="w-full max-w-md">
        <div className="rounded-2xl bg-white shadow-lg border border-gray-100 overflow-hidden">
          {/* Header */}
          <div className="bg-gradient-to-r from-blue-600 to-indigo-600 px-6 py-5 text-white">
            <div className="flex items-center gap-2 mb-1">
              <Search className="h-5 w-5" />
              <h1 className="text-lg font-bold">Track Your Repair</h1>
            </div>
            <p className="text-blue-100 text-sm">Enter your ticket number to check the status</p>
          </div>

          <div className="p-6">
            <form onSubmit={handleSearch} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Ticket Number</label>
                <input
                  type="text"
                  placeholder="e.g. TEC-00001"
                  value={ticketNumber}
                  onChange={(e) => setTicketNumber(e.target.value.toUpperCase())}
                  className="w-full rounded-lg border border-gray-300 px-3 py-2.5 text-sm focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-100"
                  required
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Phone Number <span className="text-gray-400 font-normal">(optional, for verification)</span>
                </label>
                <input
                  type="tel"
                  placeholder="e.g. 07700 900000"
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  className="w-full rounded-lg border border-gray-300 px-3 py-2.5 text-sm focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-100"
                />
              </div>
              <button
                type="submit"
                disabled={loading || !ticketNumber.trim()}
                className="w-full flex items-center justify-center gap-2 rounded-lg bg-blue-600 px-4 py-2.5 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
              >
                {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Search className="h-4 w-4" />}
                {loading ? 'Searching...' : 'Check Status'}
              </button>
            </form>

            {/* Error */}
            {error && (
              <div className="mt-4 flex items-start gap-2 rounded-lg bg-red-50 p-3 text-sm text-red-700">
                <AlertCircle className="h-4 w-4 shrink-0 mt-0.5" />
                <span>{error}</span>
              </div>
            )}

            {/* Result */}
            {result && statusCfg && (
              <div className="mt-4 rounded-xl border border-gray-100 overflow-hidden">
                <div className={`flex items-center gap-3 px-4 py-3 ${statusCfg.bg}`}>
                  <span className={statusCfg.color}>{statusCfg.icon}</span>
                  <div>
                    <p className={`font-semibold text-sm ${statusCfg.color}`}>{statusCfg.label}</p>
                    <p className="text-xs text-gray-500">Ticket {result.ticket_number}</p>
                  </div>
                </div>
                <div className="px-4 py-3 space-y-2 text-sm">
                  <div className="flex justify-between">
                    <span className="text-gray-500">Device</span>
                    <span className="font-medium text-gray-900">{result.device}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-gray-500">Issue</span>
                    <span className="font-medium text-gray-900 text-right max-w-[60%]">{result.issue}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-gray-500">Received</span>
                    <span className="text-gray-700">{new Date(result.created_at).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-gray-500">Last updated</span>
                    <span className="text-gray-700">{new Date(result.updated_at).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })}</span>
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>

        {result?.store_name && (
          <p className="text-center text-xs text-gray-400 mt-3">{result.store_name}</p>
        )}
      </div>
    </div>
  )
}
